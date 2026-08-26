// api/ai-draft.js
//
// Drafts the Service Description, Inclusions and Exclusions for a quote in
// the TWS portal.
//
// WHY THIS RUNS ON THE SERVER
// The Anthropic API key must never reach the browser. If the portal called
// Anthropic directly, anyone who opened developer tools could read the key
// out of the network tab and use it to run up charges on your account. This
// endpoint keeps the key in an environment variable on the server; the
// browser only ever talks to your own domain.
//
// SETUP — see AI-SETUP.md for step-by-step instructions.
//   1. Save this file as /api/ai-draft.js in your project
//   2. Set the ANTHROPIC_API_KEY environment variable
//   3. Redeploy
//
// OPTIONAL ENVIRONMENT VARIABLES
//   ANTHROPIC_MODEL   model to use (default below)
//   AI_MAX_TOKENS     response length cap (default 1500)

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL      = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS = parseInt(process.env.AI_MAX_TOKENS || '1500', 10);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'AI drafting is not set up yet. An ANTHROPIC_API_KEY environment variable needs adding on the server, then a redeploy.',
    });
  }

  try {
    const {
      mode, instructions,
      customerName, jobType, siteAddress, lineItems, notes,
      existingScope, existingInclusions, existingExclusions,
    } = req.body || {};

    const scopeOnly = mode === 'scope';
    // 'add' keeps what the user already has and works the new instruction in,
    // rather than throwing away wording they may have edited by hand.
    const addMode = mode === 'add';

    // Summarise the job. Prices are included so the wording can reflect how
    // the work is sold — per tonne versus per load — but the model is told
    // not to restate figures, because the table already shows them.
    const itemLines = (Array.isArray(lineItems) ? lineItems : [])
      .map(i => {
        const bits = [
          i.product_name || i.description || 'Item',
          i.quantity ? i.quantity + (i.unit ? ' ' + i.unit : '') : null,
          i.customer_price ? '\u00A3' + i.customer_price + ' per ' + (i.unit || 'unit') : null,
          i.optional ? '(OPTIONAL EXTRA \u2014 customer may or may not instruct this)' : null,
        ].filter(Boolean);
        return '- ' + bits.join(' \u00B7 ');
      })
      .join('\n') || '- (no line items yet)';

    const briefParts = [
      'Customer: ' + (customerName || 'not specified'),
      'Job type: ' + (jobType || 'not specified'),
      'Site: ' + (siteAddress || 'not specified'),
      'Line items:',
      itemLines,
    ];

    // The user's own instructions carry the most weight — this is the whole
    // point of the brief box in the portal.
    if (instructions && instructions.trim()) {
      briefParts.push('');
      briefParts.push('WHAT THE SALESPERSON WANTS SAID (follow this closely \u2014 it comes');
      briefParts.push('from the person who actually spoke to the customer, so it outranks');
      briefParts.push('anything you might otherwise assume about the job):');
      briefParts.push(instructions.trim());
    }

    if (notes && notes.trim()) {
      briefParts.push('');
      briefParts.push('Internal notes on the quote (context only, do not quote verbatim): ' + notes.trim());
    }

    if (scopeOnly && existingScope && existingScope.trim()) {
      briefParts.push('');
      briefParts.push('Current description, to improve rather than ignore: ' + existingScope.trim());
    }

    if (addMode) {
      briefParts.push('');
      briefParts.push('=== EXISTING WORDING \u2014 KEEP ALL OF THIS ===');
      briefParts.push('');
      briefParts.push('SERVICE DESCRIPTION:');
      briefParts.push(existingScope && existingScope.trim() ? existingScope.trim() : '(empty)');
      briefParts.push('');
      briefParts.push('INCLUSIONS:');
      briefParts.push(existingInclusions && existingInclusions.trim() ? existingInclusions.trim() : '(empty)');
      briefParts.push('');
      briefParts.push('EXCLUSIONS:');
      briefParts.push(existingExclusions && existingExclusions.trim() ? existingExclusions.trim() : '(empty)');
      briefParts.push('');
      briefParts.push('=== END EXISTING WORDING ===');
    }

    const brief = briefParts.join('\n');

    const rules = [];

    if (addMode) {
      rules.push(
        'You are ADDING TO an existing quotation, not rewriting it.',
        '',
        'The existing wording is shown at the end of the brief. It has been',
        'written and possibly hand-edited by the salesperson. Your job is to',
        'keep it and work the new instruction into it.',
        '',
        'Absolute rules for this task:',
        '- Reproduce every existing sentence and every existing bullet. Do not',
        '  drop, shorten, merge, reorder or reword any of them.',
        '- Add only what the new instruction calls for.',
        '- Put new material where it belongs: a new constraint or timing detail',
        '  goes in the description, something we are providing goes in',
        '  inclusions, something we are not covering goes in exclusions.',
        '- If the instruction only affects one section, return the other two',
        '  exactly as they were.',
        '- Return the COMPLETE updated text for all three sections, existing',
        '  content included \u2014 not just the new parts.',
        ''
      );
    }

    rules.push(
      'You write quotation wording for Total Waste Services Ltd, a UK waste',
      'management and aggregates broker. They supply skips, aggregates, muck away,',
      'grab hire and roll-on roll-off, and arrange licensed disposal.',
      '',
      'Write in plain British English for a construction site manager or QS.',
      'Be concrete and specific to the job described. No marketing language, no',
      'superlatives, no filler.',
      '',
      'Rules you must follow:',
      "- Follow the salesperson's instructions above closely where they are given.",
      '- Never invent prices, dates, tonnages or quantities not in the brief.',
      '- Never invent licence numbers, permit numbers or insurance figures.',
      '- Do not promise delivery times or completion dates unless given one.',
      '- Do not restate the line item prices; the table already shows them.',
      '- If the brief is thin, write less rather than padding it out.'
    );

    if (!scopeOnly) {
      rules.push(
        '- Exclusions must be genuinely protective and realistic for this trade:',
        '  offloading, spreading, compaction, standing time, contaminated or',
        '  hazardous material found on site, reinstatement, out-of-hours work,',
        '  site access. Only include ones plausible for the job described.'
      );
    }

    rules.push('', 'Return ONLY a JSON object, no preamble and no markdown fences:');

    if (scopeOnly) {
      rules.push('{ "scopeDescription": "one paragraph, 2-4 sentences" }');
    } else {
      rules.push(
        '{',
        '  "scopeDescription": "one paragraph, 2-4 sentences",',
        '  "inclusions": ["short line", "short line"],',
        '  "exclusions": ["short line", "short line"]',
        '}',
        'Aim for 4-6 inclusions and 4-6 exclusions. Each a single short line, no',
        'trailing full stops, no leading bullet characters.'
      );
    }

    const anthropicRes = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: rules.join('\n'),
        messages: [{
          role: 'user',
          content: (scopeOnly
            ? 'Write just the service description for this job:\n\n'
            : 'Draft quotation wording for this job:\n\n') + brief,
        }],
      }),
    });

    if (!anthropicRes.ok) {
      const detail = await anthropicRes.text();
      console.error('[ai-draft] Anthropic error', anthropicRes.status, detail);
      // Translate the common failures into something a user can act on.
      if (anthropicRes.status === 401) {
        return res.status(502).json({ error: 'The API key was rejected. Check ANTHROPIC_API_KEY on the server.' });
      }
      if (anthropicRes.status === 429) {
        return res.status(502).json({ error: 'Rate limited by the AI service. Wait a moment and try again.' });
      }
      if (anthropicRes.status === 400 && detail.indexOf('credit') !== -1) {
        return res.status(502).json({ error: 'The Anthropic account is out of credit. Top it up at console.anthropic.com.' });
      }
      return res.status(502).json({
        error: 'The AI service returned an error (' + anthropicRes.status + '). Please try again.',
      });
    }

    const data = await anthropicRes.json();
    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    // Strip markdown fences if the model wrapped the JSON despite instructions.
    const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      // Last resort: pull the outermost JSON object out of the response.
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start === -1 || end === -1) {
        console.error('[ai-draft] unparseable response:', cleaned.slice(0, 500));
        return res.status(502).json({ error: 'Could not read the AI response. Please try again.' });
      }
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    }

    const asLines = (v) => Array.isArray(v)
      ? v.map(s => String(s).replace(/^\s*[-\u2022*]\s*/, '').trim()).filter(Boolean).join('\n')
      : String(v || '').trim();

    return res.status(200).json({
      scopeDescription: String(parsed.scopeDescription || '').trim(),
      inclusions: scopeOnly ? '' : asLines(parsed.inclusions),
      exclusions: scopeOnly ? '' : asLines(parsed.exclusions),
    });

  } catch (err) {
    console.error('[ai-draft] failed:', err);
    return res.status(500).json({ error: err.message || 'Unexpected error' });
  }
}
