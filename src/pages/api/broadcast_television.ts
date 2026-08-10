import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { NextApiRequest, NextApiResponse } from 'next';
import { verifyToken, hashToken } from '@/lib/auth';
import db from '@/lib/db';

// Define the shape of your CSV data
interface CSVRow {
  'Call Sign'?: string;
  'Station'?: string;
  'Rate'?: string;
  'TAT'?: string;
  'Sponsored'?: string;
  'Indexed'?: string;
  'Segement Length'?: string;
  'Location'?: string;
  'Program Name'?: string;
  'Interview Type'?: string;
  'Example'?: string;
}

interface TransformedCSVItem {
  CallSign: string;
  station: string;
  rate: number;
  tat: string;
  sponsored: string;
  indexed: string;
  SegmentLength: string;
  location: string;
  ProgramName: string;
  InterviewType: string;
  Example: string;
}

interface PricingFactorRule {
  min_price: number;
  max_price: number | null;
  addition_type: 'fixed' | 'percentage';
  addition_value: number;
}

function roundToNearest50or100(num: number): number {
  const remainder = num % 100;
  if (remainder < 25) {
    return Math.floor(num / 100) * 100;
  } else if (remainder < 75) {
    return Math.floor(num / 100) * 100 + 50;
  } else {
    return Math.ceil(num / 100) * 100;
  }
}

// Your original default pricing logic (fallback)
function calculateDefaultPrice(priceNum: number): number {
  if (priceNum <= 500) {
    return priceNum + 150;
  } else {
    return priceNum + (priceNum * 0.35);
  }
}

// Pricing logic using custom factor rules
function calculatePriceWithFactor(originalPrice: number, rules: PricingFactorRule[]): number {
  console.log(`🔍 [CSV] Calculating price for $${originalPrice} with ${rules.length} rules`);
  
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    // Convert to numbers to ensure proper comparison
    const minPrice = parseFloat(rule.min_price.toString());
    const maxPrice = rule.max_price ? parseFloat(rule.max_price.toString()) : null;
    const additionValue = parseFloat(rule.addition_value.toString());
    
    const withinMinRange = originalPrice >= minPrice;
    const withinMaxRange = maxPrice === null || originalPrice <= maxPrice;
    
    console.log(`📋 [CSV] Rule ${i + 1}: $${minPrice} - ${maxPrice || '∞'} | Type: ${rule.addition_type} | Value: ${additionValue}`);
    console.log(`✅ [CSV] Price $${originalPrice} fits? Min: ${withinMinRange}, Max: ${withinMaxRange}`);
    
    if (withinMinRange && withinMaxRange) {
      let result;
      if (rule.addition_type === 'fixed') {
        result = originalPrice + additionValue;
        console.log(`💰 [CSV] MATCH! Fixed: $${originalPrice} + $${additionValue} = $${result}`);
      } else {
        const percentageAmount = (originalPrice * additionValue / 100);
        result = originalPrice + percentageAmount;
        console.log(`💰 [CSV] MATCH! Percentage: $${originalPrice} + (${additionValue}% = $${percentageAmount}) = $${result}`);
      }
      return result;
    }
  }
  
  console.log(`❌ [CSV] No rule matched for $${originalPrice}, using fallback default logic`);
  return calculateDefaultPrice(originalPrice);
}

// Get user's assigned pricing factor
async function getUserAssignedFactor(userId: number): Promise<PricingFactorRule[] | null> {
  try {
    console.log(`🔍 [CSV] Looking for assigned factor for user ID: ${userId}`);
    
    // Check if user has any assigned factor
    const userFactorResult = await db.query(`
      SELECT pf.id, pf.name FROM pricing_factors pf
      JOIN user_pricing_factors upf ON pf.id = upf.factor_id
      WHERE upf.user_id = $1 AND pf.is_active = true
    `, [userId]);

    if (userFactorResult.rows.length === 0) {
      console.log(`❌ [CSV] User ${userId} has no assigned factor - using old default logic`);
      return null;
    }

    const factorId = userFactorResult.rows[0].id;
    const factorName = userFactorResult.rows[0].name;
    console.log(`✅ [CSV] User ${userId} has assigned factor: "${factorName}" (ID: ${factorId})`);

    // Get factor rules
    const rulesResult = await db.query(`
      SELECT min_price, max_price, addition_type, addition_value
      FROM pricing_factor_rules 
      WHERE factor_id = $1 
      ORDER BY min_price ASC
    `, [factorId]);

    console.log(`📋 [CSV] Found ${rulesResult.rows.length} rules for factor "${factorName}"`);
    rulesResult.rows.forEach((rule, index) => {
      console.log(`  [CSV] Rule ${index + 1}: $${rule.min_price}-${rule.max_price || '∞'} → ${rule.addition_type} ${rule.addition_value}`);
    });

    return rulesResult.rows;
  } catch (error) {
    console.error('❌ [CSV] Error getting user assigned factor:', error);
    return null;
  }
}

// Verify user session from cookie
async function getUserFromRequest(req: NextApiRequest): Promise<number | null> {
  try {
    const token = req.cookies['auth-token'];
    if (!token) {
      console.log('❌ [CSV] No auth token found');
      return null;
    }

    const user = verifyToken(token);
    if (!user) {
      console.log('❌ [CSV] Invalid token');
      return null;
    }

    // Verify session exists in database
    const tokenHash = hashToken(token);
    const sessionResult = await db.query(
      'SELECT user_id FROM user_sessions WHERE token_hash = $1 AND expires_at > NOW()',
      [tokenHash]
    );

    if (sessionResult.rows.length === 0) {
      console.log('❌ [CSV] Session not found in database');
      return null;
    }

    console.log(`✅ [CSV] User authenticated: ID ${user.id} (${user.email})`);
    return user.id;
  } catch (error) {
    console.error('❌ [CSV] Error verifying user session:', error);
    return null;
  }
}

export default async function handler(
  req: NextApiRequest, 
  res: NextApiResponse<TransformedCSVItem[] | { error: string }>
) {
  try {
    console.log('\n🚀 === CSV API /data2 called ===');
    
    // Get user ID from session (if logged in)
    const userId = await getUserFromRequest(req);
    
    // Get user's assigned pricing factor
    let assignedPricingRules: PricingFactorRule[] | null = null;
    if (userId) {
      assignedPricingRules = await getUserAssignedFactor(userId);
    } else {
      console.log('👤 [CSV] User not logged in - using old default pricing');
    }

    // Read and parse the CSV file
    const filePath = path.resolve(process.cwd(), 'data', 'data2.csv');
    const fileContent = fs.readFileSync(filePath, 'utf8');

    const { data, errors } = Papa.parse<CSVRow>(fileContent, {
      header: true,
      skipEmptyLines: true,
    });

    if (errors.length) {
      console.error('[CSV] CSV parsing errors:', errors);
      return res.status(400).json({ error: 'CSV parsing error'});
    }

    console.log(`📊 [CSV] Processing ${data.length} CSV items`);

    const transformed: TransformedCSVItem[] = data.map((item: CSVRow) => {
      // Extract and parse the original rate
      const rawRate = item.Rate || '';
      const originalRate = rawRate ? Number(rawRate.replace(/\$/g, '').replace(/,/g, '')) : 0;

      // Special debug for specific rates (like $250)
      if (Math.abs(originalRate - 250) < 0.01) {
        console.log(`\n🚨 [CSV] DEBUGGING $250 ITEM: "${item.Station}"`);
        console.log(`📊 [CSV] Raw rate string: "${rawRate}"`);
        console.log(`📊 [CSV] Parsed rate number: ${originalRate}`);
        console.log(`📊 [CSV] Rate type: ${typeof originalRate}`);
        console.log(`📊 [CSV] Has assigned rules: ${assignedPricingRules ? 'YES' : 'NO'}`);
        console.log(`📊 [CSV] Rules count: ${assignedPricingRules ? assignedPricingRules.length : 0}`);
        if (assignedPricingRules) {
          console.log(`📊 [CSV] Rules:`, assignedPricingRules);
        }
      }

      let finalRate: number = originalRate;
      
      // Apply pricing logic only if we have a valid rate
      if (originalRate > 0) {
        console.log(`\n📦 [CSV] Item: "${item.Station}" - Original Rate: $${originalRate}`);
        
        if (assignedPricingRules && assignedPricingRules.length > 0) {
          console.log('🎯 [CSV] Using custom pricing factor');
          const calculatedRate = calculatePriceWithFactor(originalRate, assignedPricingRules);
          console.log(`📐 [CSV] Before rounding: $${calculatedRate}`);
          finalRate = roundToNearest50or100(calculatedRate);
          console.log(`🎯 [CSV] Final rate: $${finalRate}`);
          
          // Extra debug for $250 items
          if (Math.abs(originalRate - 250) < 0.01) {
            console.log(`🚨 [CSV] $250 ITEM FINAL RESULT: $${originalRate} → $${finalRate}`);
          }
        } else {
          console.log('🔄 [CSV] Using old default pricing logic');
          const calculatedRate = calculateDefaultPrice(originalRate);
          console.log(`📐 [CSV] Calculated: $${calculatedRate}`);
          finalRate = roundToNearest50or100(calculatedRate);
          console.log(`🎯 [CSV] Final rate: $${finalRate}`);
        }
      } else {
        console.log(`⚠️ [CSV] Invalid rate for "${item.Station}": "${rawRate}"`);
      }

      return {
        CallSign: item['Call Sign'] || '',
        station: item['Station'] || '',
        rate: finalRate,
        tat: item['TAT'] || '',
        sponsored: item['Sponsored'] || '',
        indexed: item['Indexed'] || '',
        SegmentLength: item['Segement Length'] || '',
        location: item['Location'] || '',
        ProgramName: item['Program Name'] || '',
        InterviewType: item['Interview Type'] || '',
        Example: item['Example'] || '',
      };
    });

    console.log('✅ [CSV] === CSV API processing complete ===\n');
    res.status(200).json(transformed);
  } catch (error) {
    console.error('❌ [CSV] Error reading or parsing CSV file:', error);
    res.status(500).json({ error: 'Failed to read and process CSV file' });
  }
}