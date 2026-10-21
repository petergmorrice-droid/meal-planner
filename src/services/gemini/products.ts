/** Tidying the product list: Gemini's suggestions for duplicates, names and aisles (or simple rules offline). */
import { GroceryItem, DatabaseCleanAction } from '../../types';
import { callGeminiRest, getGeminiApiKey, readJsonAnswer } from './client';

function cleanGroceryDatabaseLocally(items: GroceryItem[]): DatabaseCleanAction[] {
  if (!Array.isArray(items) || items.length === 0) return [];

  const actions: DatabaseCleanAction[] = [];
  const absorbedIds = new Set<string>();

  const getStem = (name: string): string => {
    let s = (name || '').toLowerCase().trim().replace(/[-_]/g, ' ');
    if (s.endsWith('es')) s = s.slice(0, -2);
    else if (s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
    return s;
  };

  const knownSynonyms: Array<[RegExp, RegExp]> = [
    [/^minced beef$/i, /^beef mince$/i],
    [/^minced pork$/i, /^pork mince$/i],
    [/^minced lamb$/i, /^lamb mince$/i],
    [/^courgette$/i, /^zucchini$/i],
    [/^aubergine$/i, /^eggplant$/i],
    [/^spring onions?$/i, /^scallions?$/i],
    [/^bell peppers?$/i, /^sweet peppers?$/i],
  ];

  for (let i = 0; i < items.length; i++) {
    const itemA = items[i];
    if (absorbedIds.has(itemA.id)) continue;

    for (let j = i + 1; j < items.length; j++) {
      const itemB = items[j];
      if (absorbedIds.has(itemB.id)) continue;

      let isDuplicate = false;
      let reason = '';

      for (const [rA, rB] of knownSynonyms) {
        if ((rA.test(itemA.name) && rB.test(itemB.name)) || (rB.test(itemA.name) && rA.test(itemB.name))) {
          isDuplicate = true;
          reason = `Absorb equivalent product "${itemB.name}" into "${itemA.name}" and save as alias.`;
          break;
        }
      }

      if (!isDuplicate) {
        const stemA = getStem(itemA.name);
        const stemB = getStem(itemB.name);
        if (
          stemA === stemB ||
          stemA === (itemB.name || '').toLowerCase() ||
          stemB === (itemA.name || '').toLowerCase()
        ) {
          isDuplicate = true;
          reason = `Merge singular/plural variations "${itemA.name}" and "${itemB.name}".`;
        }
      }

      if (isDuplicate) {
        actions.push({
          actionType: 'merge',
          primaryItemId: itemA.id,
          secondaryItemId: itemB.id,
          reason,
        });
        absorbedIds.add(itemB.id);
      }
    }
  }

  for (const item of items) {
    if (absorbedIds.has(item.id)) continue;
    const name = item.name || '';
    if (name.length > 3 && name === name.toUpperCase() && /[A-Z]/.test(name)) {
      const cleanName = name.toLowerCase();
      actions.push({
        actionType: 'rename',
        primaryItemId: item.id,
        newName: cleanName,
        reason: `Standardize uppercase "${name}" to clean lowercase "${cleanName}".`,
      });
    }
  }

  for (const item of items) {
    if (absorbedIds.has(item.id)) continue;
    const lowerName = (item.name || '').toLowerCase();
    const cat = (item.category || '').toLowerCase();

    if (
      /cream|butter|milk|cheese|yogurt|yoghurt|parmesan|cheddar|mozzarella|ricotta/i.test(lowerName) &&
      cat === 'pantry'
    ) {
      actions.push({
        actionType: 'recategorize',
        primaryItemId: item.id,
        newAisle: 'Dairy',
        reason: `Move dairy product "${item.name}" from Pantry to Dairy.`,
      });
    }
  }

  return actions;
}
const CLEAN_DATABASE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    actions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          actionType: { type: 'STRING', enum: ['merge', 'rename', 'recategorize'] },
          primaryItemId: { type: 'STRING', description: 'The ID of the item to keep or update.' },
          secondaryItemId: { type: 'STRING', description: 'For merges: duplicate item ID to absorb.' },
          newName: { type: 'STRING', description: 'For renames: standardize name.' },
          newAisle: { type: 'STRING', description: 'For recategorizations: corrected aisle name.' },
          reason: { type: 'STRING', description: 'Explanation of suggested action.' },
        },
        required: ['actionType', 'primaryItemId', 'reason'],
      },
    },
  },
  required: ['actions'],
};
export async function cleanGroceryDatabaseApi(items: GroceryItem[]): Promise<DatabaseCleanAction[]> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }

  const prompt = `Review the following household grocery database items and identify duplicates, naming inconsistencies, and miscategorized aisles.

Item Catalog:
${JSON.stringify(
  items.map((i) => ({
    id: i.id,
    name: i.name,
    category: i.category,
    unit: i.unit,
    aliases: i.aliases || [],
  })),
  null,
  2,
)}

Return a structured JSON object with the "actions" array detailing any recommended merges, renames, and recategorizations. If clean, return {"actions": []}.`;

  try {
    const rawText = await callGeminiRest(
      apiKey,
      prompt,
      'You are a database normalization specialist.',
      CLEAN_DATABASE_SCHEMA,
    );
    const data: { actions?: DatabaseCleanAction[] } = readJsonAnswer(rawText);
    return data?.actions || [];
  } catch (err) {
    console.error('Gemini cleanGroceryDatabaseApi failed, falling back locally:', err);
    return cleanGroceryDatabaseLocally(items);
  }
}
