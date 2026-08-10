import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { NextApiRequest, NextApiResponse } from 'next';
import { verifyToken, hashToken } from '@/lib/auth';
import db from '@/lib/db';

// Define the shape of your CSV data (matching your actual CSV headers)
interface CSVRow {
  'Affiliate'?: string;
  'Example'?: string;
  'Calls'?: string;
  'State'?: string;
  'Market'?: string;
  'Program Name'?: string;
  'Location'?: string;
  'Time'?: string;
  'Rate'?: string;
}

// Define the transformed output shape
interface TransformedTelevisionItem {
  affiliate: string;
  example: string;
  calls: string;
  state: string;
  market: string;
  programName: string;
  location: string;
  time: string;
  rate: number;
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
  console.log(`🔍 [TV] Calculating price for $${originalPrice} with ${rules.length} rules`);
  
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    // Convert to numbers to ensure proper comparison
    const minPrice = parseFloat(rule.min_price.toString());
    const maxPrice = rule.max_price ? parseFloat(rule.max_price.toString()) : null;
    const additionValue = parseFloat(rule.addition_value.toString());
    
    const withinMinRange = originalPrice >= minPrice;
    const withinMaxRange = maxPrice === null || originalPrice <= maxPrice;
    
    console.log(`📋 [TV] Rule ${i + 1}: $${minPrice} - ${maxPrice || '∞'} | Type: ${rule.addition_type} | Value: ${additionValue}`);
    console.log(`✅ [TV] Price $${originalPrice} fits? Min: ${withinMinRange}, Max: ${withinMaxRange}`);
    
    if (withinMinRange && withinMaxRange) {
      let result;
      if (rule.addition_type === 'fixed') {
        result = originalPrice + additionValue;
        console.log(`💰 [TV] MATCH! Fixed: $${originalPrice} + $${additionValue} = $${result}`);
      } else {
        const percentageAmount = (originalPrice * additionValue / 100);
        result = originalPrice + percentageAmount;
        console.log(`💰 [TV] MATCH! Percentage: $${originalPrice} + (${additionValue}% = $${percentageAmount}) = $${result}`);
      }
      return result;
    }
  }
  
  console.log(`❌ [TV] No rule matched for $${originalPrice}, using fallback default logic`);
  return calculateDefaultPrice(originalPrice);
}

// Get user's assigned pricing factor
async function getUserAssignedFactor(userId: number): Promise<PricingFactorRule[] | null> {
  try {
    console.log(`🔍 [TV] Looking for assigned factor for user ID: ${userId}`);
    
    // Check if user has any assigned factor
    const userFactorResult = await db.query(`
      SELECT pf.id, pf.name FROM pricing_factors pf
      JOIN user_pricing_factors upf ON pf.id = upf.factor_id
      WHERE upf.user_id = $1 AND pf.is_active = true
    `, [userId]);

    if (userFactorResult.rows.length === 0) {
      console.log(`❌ [TV] User ${userId} has no assigned factor - using old default logic`);
      return null;
    }

    const factorId = userFactorResult.rows[0].id;
    const factorName = userFactorResult.rows[0].name;
    console.log(`✅ [TV] User ${userId} has assigned factor: "${factorName}" (ID: ${factorId})`);

    // Get factor rules
    const rulesResult = await db.query(`
      SELECT min_price, max_price, addition_type, addition_value
      FROM pricing_factor_rules 
      WHERE factor_id = $1 
      ORDER BY min_price ASC
    `, [factorId]);

    console.log(`📋 [TV] Found ${rulesResult.rows.length} rules for factor "${factorName}"`);
    rulesResult.rows.forEach((rule, index) => {
      console.log(`  [TV] Rule ${index + 1}: $${rule.min_price}-${rule.max_price || '∞'} → ${rule.addition_type} ${rule.addition_value}`);
    });

    return rulesResult.rows;
  } catch (error) {
    console.error('❌ [TV] Error getting user assigned factor:', error);
    return null;
  }
}

// Verify user session from cookie
async function getUserFromRequest(req: NextApiRequest): Promise<number | null> {
  try {
    const token = req.cookies['auth-token'];
    if (!token) {
      console.log('❌ [TV] No auth token found');
      return null;
    }

    const user = verifyToken(token);
    if (!user) {
      console.log('❌ [TV] Invalid token');
      return null;
    }

    // Verify session exists in database
    const tokenHash = hashToken(token);
    const sessionResult = await db.query(
      'SELECT user_id FROM user_sessions WHERE token_hash = $1 AND expires_at > NOW()',
      [tokenHash]
    );

    if (sessionResult.rows.length === 0) {
      console.log('❌ [TV] Session not found in database');
      return null;
    }

    console.log(`✅ [TV] User authenticated: ID ${user.id} (${user.email})`);
    return user.id;
  } catch (error) {
    console.error('❌ [TV] Error verifying user session:', error);
    return null;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TransformedTelevisionItem[] | { error: string; details?: unknown }>
) {
  try {
    console.log('\n🚀 === TV API /television called ===');
    
    // Get user ID from session (if logged in)
    const userId = await getUserFromRequest(req);
    
    // Get user's assigned pricing factor
    let assignedPricingRules: PricingFactorRule[] | null = null;
    if (userId) {
      assignedPricingRules = await getUserAssignedFactor(userId);
    } else {
      console.log('👤 [TV] User not logged in - using old default pricing');
    }

    // Read and parse the CSV file
    const filePath = path.resolve(process.cwd(), 'data', 'data1.csv');
    const fileContent = fs.readFileSync(filePath, 'utf8');

    console.log('📄 [TV] Raw CSV content preview:');
    console.log(fileContent.split('\n').slice(0, 3).join('\n'));

    const { data, errors } = Papa.parse<CSVRow>(fileContent, {
      header: true,
      skipEmptyLines: true,
      delimitersToGuess: [',', '\t', '|', ';']
    });

    if (errors.length) {
      console.error('[TV] CSV parsing errors:', errors);
      return res.status(400).json({ error: 'CSV parsing error', details: errors });
    }

    console.log(`📊 [TV] Processing ${data.length} TV items`);
    console.log('📋 [TV] First parsed item:', data[0]);
    console.log('📋 [TV] Available headers:', Object.keys(data[0] || {}));

    const transformed: TransformedTelevisionItem[] = data.map((item: CSVRow, index) => {
      console.log(`\n📦 [TV] Processing item ${index + 1}:`, item);
      
      // Extract and parse the original rate
      const rawRate = item.Rate || '';
      const originalRate = rawRate ? Number(rawRate.replace(/\$/g, '').replace(/,/g, '')) : 0;

      console.log(`💵 [TV] Raw rate: "${rawRate}" → Parsed: ${originalRate}`);

      // Special debug for high-value items
      if (originalRate >= 1000) {
        console.log(`\n🚨 [TV] HIGH VALUE ITEM: "${item['Program Name']}" at ${item.Calls}`);
        console.log(`📊 [TV] Raw rate string: "${rawRate}"`);
        console.log(`📊 [TV] Parsed rate number: ${originalRate}`);
        console.log(`📊 [TV] Has assigned rules: ${assignedPricingRules ? 'YES' : 'NO'}`);
      }

      let finalRate: number = originalRate;
      
      // Apply pricing logic only if we have a valid rate
      if (originalRate > 0) {
        console.log(`\n📦 [TV] Station: "${item.Calls}" - Original Rate: $${originalRate}`);
        
        if (assignedPricingRules && assignedPricingRules.length > 0) {
          console.log('🎯 [TV] Using custom pricing factor');
          const calculatedRate = calculatePriceWithFactor(originalRate, assignedPricingRules);
          console.log(`📐 [TV] Before rounding: $${calculatedRate}`);
          finalRate = roundToNearest50or100(calculatedRate);
          console.log(`🎯 [TV] Final rate: $${finalRate}`);
          
          // Extra debug for high-value items
          if (originalRate >= 1000) {
            console.log(`🚨 [TV] HIGH VALUE FINAL RESULT: $${originalRate} → $${finalRate}`);
          }
        } else {
          console.log('🔄 [TV] Using old default pricing logic');
          const calculatedRate = calculateDefaultPrice(originalRate);
          console.log(`📐 [TV] Calculated: $${calculatedRate}`);
          finalRate = roundToNearest50or100(calculatedRate);
          console.log(`🎯 [TV] Final rate: $${finalRate}`);
        }
      } else {
        console.log(`⚠️ [TV] Invalid rate for "${item.Calls}": "${rawRate}"`);
      }

      const transformedItem = {
        affiliate: item.Affiliate || '',
        example: item.Example || '',
        calls: item.Calls || '',
        state: item.State || '',
        market: item.Market || '',
        programName: item['Program Name'] || '',
        location: item.Location || '',
        time: item.Time || '',
        rate: finalRate
      };

      console.log(`✅ [TV] Transformed item:`, transformedItem);
      return transformedItem;
    });

    console.log('✅ [TV] === TV API processing complete ===\n');
    console.log(`📊 [TV] Returning ${transformed.length} transformed items`);
    
    res.status(200).json(transformed);
  } catch (error) {
    console.error('❌ [TV] Error reading or parsing CSV file:', error);
    res.status(500).json({ error: 'Failed to read and process CSV file' });
  }
}