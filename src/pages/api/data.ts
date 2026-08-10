// src/pages/api/data.ts
import fs from 'fs';
import path from 'path';
import { NextApiRequest, NextApiResponse } from 'next';
import { verifyToken, hashToken } from '@/lib/auth';
import db from '@/lib/db';

interface Genre {
  name: string;
}

interface Region {
  name: string;
}

interface Asset {
  _ref: string;
}

interface ArticlePreview {
  asset?: Asset;
}

interface Logo {
  asset?: Asset;
}

interface DataItem {
  name?: string;
  defaultPrice?: string[];
  do_follow?: boolean;
  estimated_time?: string;
  genres?: Genre[];
  regions?: Region[];
  url?: string;
  articlePreview?: ArticlePreview;
  logo?: Logo;
}

interface JsonData {
  result: DataItem[];
}

interface TransformedItem {
  name: string;
  price: number | string;
  do_follow: boolean | string;
  estimated_time: string;
  genres: string;
  regions: string;
  url: string;
  example: string;
  logo: string;
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
  console.log(`🔍 Calculating price for $${originalPrice} with ${rules.length} rules`);
  
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    // Convert to numbers to ensure proper comparison
    const minPrice = parseFloat(rule.min_price.toString());
    const maxPrice = rule.max_price ? parseFloat(rule.max_price.toString()) : null;
    const additionValue = parseFloat(rule.addition_value.toString());
    
    const withinMinRange = originalPrice >= minPrice;
    const withinMaxRange = maxPrice === null || originalPrice <= maxPrice;
    
    console.log(`📋 Rule ${i + 1}: $${minPrice} - ${maxPrice || '∞'} | Type: ${rule.addition_type} | Value: ${additionValue}`);
    console.log(`✅ Price $${originalPrice} fits? Min: ${withinMinRange}, Max: ${withinMaxRange}`);
    
    if (withinMinRange && withinMaxRange) {
      let result;
      if (rule.addition_type === 'fixed') {
        result = originalPrice + additionValue;
        console.log(`💰 MATCH! Fixed: $${originalPrice} + $${additionValue} = $${result}`);
      } else {
        const percentageAmount = (originalPrice * additionValue / 100);
        result = originalPrice + percentageAmount;
        console.log(`💰 MATCH! Percentage: $${originalPrice} + (${additionValue}% = $${percentageAmount}) = $${result}`);
      }
      return result;
    }
  }
  
  console.log(`❌ No rule matched for $${originalPrice}, using fallback default logic`);
  return calculateDefaultPrice(originalPrice);
}

// Get user's assigned pricing factor
async function getUserAssignedFactor(userId: number): Promise<PricingFactorRule[] | null> {
  try {
    console.log(`🔍 Looking for assigned factor for user ID: ${userId}`);
    
    // Check if user has any assigned factor
    const userFactorResult = await db.query(`
      SELECT pf.id, pf.name FROM pricing_factors pf
      JOIN user_pricing_factors upf ON pf.id = upf.factor_id
      WHERE upf.user_id = $1 AND pf.is_active = true
    `, [userId]);

    if (userFactorResult.rows.length === 0) {
      console.log(`❌ User ${userId} has no assigned factor - using old default logic`);
      return null;
    }

    const factorId = userFactorResult.rows[0].id;
    const factorName = userFactorResult.rows[0].name;
    console.log(`✅ User ${userId} has assigned factor: "${factorName}" (ID: ${factorId})`);

    // Get factor rules
    const rulesResult = await db.query(`
      SELECT min_price, max_price, addition_type, addition_value
      FROM pricing_factor_rules 
      WHERE factor_id = $1 
      ORDER BY min_price ASC
    `, [factorId]);

    console.log(`📋 Found ${rulesResult.rows.length} rules for factor "${factorName}"`);
    rulesResult.rows.forEach((rule, index) => {
      console.log(`  Rule ${index + 1}: $${rule.min_price}-${rule.max_price || '∞'} → ${rule.addition_type} ${rule.addition_value}`);
    });

    return rulesResult.rows;
  } catch (error) {
    console.error('❌ Error getting user assigned factor:', error);
    return null;
  }
}

// Verify user session from cookie
async function getUserFromRequest(req: NextApiRequest): Promise<number | null> {
  try {
    const token = req.cookies['auth-token'];
    if (!token) {
      console.log('❌ No auth token found');
      return null;
    }

    const user = verifyToken(token);
    if (!user) {
      console.log('❌ Invalid token');
      return null;
    }

    // Verify session exists in database
    const tokenHash = hashToken(token);
    const sessionResult = await db.query(
      'SELECT user_id FROM user_sessions WHERE token_hash = $1 AND expires_at > NOW()',
      [tokenHash]
    );

    if (sessionResult.rows.length === 0) {
      console.log('❌ Session not found in database');
      return null;
    }

    console.log(`✅ User authenticated: ID ${user.id} (${user.email})`);
    return user.id;
  } catch (error) {
    console.error('❌ Error verifying user session:', error);
    return null;
  }
}

export default async function handler(
  req: NextApiRequest, 
  res: NextApiResponse<TransformedItem[] | { error: string }>
) {
  try {
    console.log('\n🚀 === API /data called ===');
    
    // Get user ID from session (if logged in)
    const userId = await getUserFromRequest(req);
    
    // Get user's assigned pricing factor
    let assignedPricingRules: PricingFactorRule[] | null = null;
    if (userId) {
      assignedPricingRules = await getUserAssignedFactor(userId);
    } else {
      console.log('👤 User not logged in - using old default pricing');
    }

    // Read the JSON file
    const filePath = path.resolve('data', 'data.json');
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const json: JsonData = JSON.parse(fileContent);

    if (!Array.isArray(json.result)) {
      return res.status(400).json({ error: "Invalid data format: 'result' not found." });
    }

    console.log(`📊 Processing ${json.result.length} items`);

    const transformed: TransformedItem[] = json.result.map((item: DataItem) => {
      const rawPrice = item.defaultPrice?.[0];
      const priceNum = parseFloat(rawPrice || '');

      // Special debug for $250 items
      if (Math.abs(priceNum - 250) < 0.01) {
        console.log(`\n🚨 DEBUGGING $250 ITEM: "${item.name}"`);
        console.log(`📊 Raw price string: "${rawPrice}"`);
        console.log(`📊 Parsed price number: ${priceNum}`);
        console.log(`📊 Price type: ${typeof priceNum}`);
        console.log(`📊 Has assigned rules: ${assignedPricingRules ? 'YES' : 'NO'}`);
        console.log(`📊 Rules count: ${assignedPricingRules ? assignedPricingRules.length : 0}`);
        if (assignedPricingRules) {
          console.log(`📊 Rules:`, assignedPricingRules);
        }
      }

      let finalPrice: number | string = '';
      if (!isNaN(priceNum)) {
        console.log(`\n📦 Item: "${item.name}" - Original: $${priceNum}`);
        
        if (assignedPricingRules && assignedPricingRules.length > 0) {
          console.log('🎯 Using custom pricing factor');
          const calculatedPrice = calculatePriceWithFactor(priceNum, assignedPricingRules);
          console.log(`📐 Before rounding: $${calculatedPrice}`);
          finalPrice = roundToNearest50or100(calculatedPrice);
          console.log(`🎯 Final price: $${finalPrice}`);
          
          // Extra debug for $250 items
          if (Math.abs(priceNum - 250) < 0.01) {
            console.log(`🚨 $250 ITEM FINAL RESULT: $${priceNum} → $${finalPrice}`);
          }
        } else {
          console.log('🔄 Using old default pricing logic');
          const calculatedPrice = calculateDefaultPrice(priceNum);
          console.log(`📐 Calculated: $${calculatedPrice}`);
          finalPrice = roundToNearest50or100(calculatedPrice);
          console.log(`🎯 Final price: $${finalPrice}`);
        }
      } else {
        console.log(`⚠️ Invalid price for "${item.name}": "${rawPrice}"`);
      }

      return {
        name:            item.name || '',
        price:           finalPrice !== '' ? finalPrice : '',
        do_follow:       item.do_follow ?? '',
        estimated_time:  item.estimated_time ?? '',
        genres:          item.genres?.map(g => g.name).join(', ') ?? '',
        regions:         item.regions?.map(r => r.name).join(', ') ?? '',
        url:             item.url || '',
        example:         item.articlePreview?.asset?._ref || '',
        logo:            item.logo?.asset?._ref || ''
      };
    });

    console.log('✅ === API processing complete ===\n');
    res.status(200).json(transformed);
  } catch (error) {
    console.error('❌ Error processing data:', error);
    res.status(500).json({ error: 'Failed to read and process JSON file' });
  }
}