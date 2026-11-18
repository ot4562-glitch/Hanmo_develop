import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const stages = ['1차', '2차', '3차', '4차', '공통'].map(stage => `차수:${stage}`);
const priorities = ['P0', 'P1', 'P2'].map(priority => `우선순위:${priority}`);
const kinds = ['설계', '구현', '검증'].map(kind => `유형:${kind}`);

function titleTags(title) {
  const prefix = title.match(/^(?:\s*\[[^\]\r\n]+\])+/u)?.[0] ?? '';
  return Array.from(prefix.matchAll(/\[([^\]]+)\]/gu), match => match[1].trim());
}

export function labelChanges(title, current) {
  const tags = titleTags(title);
  const legacyDesign = tags.some(tag => /^HMD-\d{3}$/u.test(tag));
  const numbers = new Set();
  for (const tag of tags) {
    const phase = tag.match(/^([1-4](?:·[1-4])*)차(?: 후속| 선택 확장)?$/u);
    for (const number of phase?.[1].split('·') ?? []) numbers.add(number);
  }
  const common = tags.includes('공통')
    || (legacyDesign && tags.some(tag => ['배포', '데이터', '검증'].includes(tag)));
  const stageLabels = numbers.size
    ? [...numbers].sort().map(number => `차수:${number}차`)
    : common ? ['차수:공통'] : [];
  const priorityLabels = priorities.filter(label => tags.includes(label.split(':')[1]));
  const kindLabels = legacyDesign
    ? ['유형:설계']
    : kinds.filter(label => tags.includes(label.split(':')[1]));

  const add = [];
  const remove = [];
  for (const [managed, desired] of [
    [stages, stageLabels],
    [priorities, priorityLabels.length === 1 ? priorityLabels : []],
    [kinds, kindLabels.length === 1 ? kindLabels : []],
  ]) {
    if (!desired.length) continue;
    add.push(...desired.filter(label => !current.includes(label)));
    remove.push(...current.filter(label => managed.includes(label) && !desired.includes(label)));
  }
  return { add, remove };
}

async function main() {
  const { GITHUB_EVENT_PATH, GITHUB_REPOSITORY, GITHUB_API_URL, GH_TOKEN } = process.env;
  const event = JSON.parse(await readFile(GITHUB_EVENT_PATH, 'utf8'));
  const root = `${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${GH_TOKEN}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  async function request(path, method = 'GET', body) {
    const response = await fetch(root + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (method === 'DELETE' && response.status === 404) return;
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
    if (response.status !== 204) return response.json();
  }

  async function reconcile(issue) {
    if (issue.pull_request) return;
    const { add, remove } = labelChanges(issue.title, issue.labels.map(label => label.name));
    const path = `/issues/${issue.number}/labels`;
    if (add.length) await request(path, 'POST', { labels: add });
    for (const label of remove) await request(`${path}/${encodeURIComponent(label)}`, 'DELETE');
    if (add.length || remove.length) console.log(`#${issue.number}: +[${add.join(', ')}] -[${remove.join(', ')}]`);
  }

  if (event.issue) {
    // Fetch current metadata so a queued event uses the latest title.
    await reconcile(await request(`/issues/${event.issue.number}`));
    return;
  }

  // Collect IDs before updating so pagination stays independent of write operations.
  const numbers = [];
  for (let page = 1; ; page++) {
    const items = await request(`/issues?state=open&sort=created&direction=asc&per_page=100&page=${page}`);
    numbers.push(...items.filter(issue => !issue.pull_request).map(issue => issue.number));
    if (items.length < 100) break;
  }
  for (const number of numbers) await reconcile(await request(`/issues/${number}`));
  console.log(`Checked ${numbers.length} open issues.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
