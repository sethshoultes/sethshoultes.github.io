// "Does AI know your business?" Asks ChatGPT, Perplexity and Google AI who to
// hire for a service in a city, then reports whether the business is named and
// who is named instead. Answers are the assistants' own, shown as received; an
// assistant that fails is reported as failed.

import { reply } from './_lib/guard.js';
import { buildQuestion, askAll } from './_lib/ask-ai.js';
import { splitAnswer, isNamed, isSame, isGenericName } from './_lib/names.js';

const OK = /^[\p{L}\p{N} .,'&()\-/]+$/u;

function field(value, label, max) {
  const v = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (v.length < 2 || v.length > max || !OK.test(v)) throw new Error(`Please enter ${label} using letters and numbers (up to ${max} characters).`);
  return v;
}

export async function onRequestPost({ data, env }) {
  let business, service, city;
  try {
    business = field(data.body.business, 'your business name', 80);
    service = field(data.body.service, 'the service you offer', 60);
    city = field(data.body.city, 'your city', 60);
  } catch (err) {
    return reply(400, { error: err.message });
  }

  if (isGenericName(business, service, city)) {
    return reply(400, { error: `"${business}" is too general to check: it is only your service, your city or a word like LLC, so it would match any competitor. Please enter your business's full, distinctive name.` });
  }

  const answers = await askAll(env, buildQuestion(service, city));
  const results = answers.map((a) => {
    if (a.state !== 'answered') return { id: a.id, label: a.label, state: a.state, error: a.error };
    const { prose, names } = splitAnswer(a.text);
    // null means the assistant gave no list of names, so we cannot say either way.
    const named = isNamed(business, names);
    return {
      id: a.id, label: a.label, state: 'answered', named,
      others: names ? names.filter((n) => !isSame(business, n)) : null,
      answer: prose.slice(0, 2500),
    };
  });

  if (results.every((r) => r.state !== 'answered')) return reply(502, { error: 'None of the assistants could answer right now. Please try again in a few minutes.' });
  return reply(200, { business, service, city, results });
}
