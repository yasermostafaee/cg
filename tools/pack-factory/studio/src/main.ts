interface TargetRow {
  key: string;
  width: number;
  height: number;
}

interface ColorRow {
  role: string;
  value: string;
  source: 'brand' | 'derived';
  derivedFrom: string;
  note: string;
}

interface FontRow {
  role: string;
  path: string;
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  licenseConfirmed: boolean;
  licenseNote: string;
}

interface AssetRow {
  role: string;
  kind: 'image' | 'lottie' | 'video' | 'audio';
  sourcePath: string;
  renderPath: string;
  note: string;
}

interface MappingRow {
  source: string;
  role: string;
}

interface TemplateRow {
  key: string;
  sourceProject: string;
  compositionId: string;
  target: string;
  displayName: string;
  outputName: string;
  colors: MappingRow[];
  assets: MappingRow[];
  fonts: MappingRow[];
  previewData: string;
  introMs: number;
  holdMs: number;
  outMs: number;
}

interface CustomerDraft {
  id: string;
  name: string;
  author: string;
  motion: 'calm' | 'news' | 'energetic';
  targets: TargetRow[];
  colors: ColorRow[];
  fonts: FontRow[];
  assets: AssetRow[];
  brandbookNotes: string;
  references: string;
  family: string;
  templates: TemplateRow[];
}

interface DeliverySummary {
  name: string;
  createdAt: string;
  status: 'complete' | 'incomplete' | 'unknown';
  templates: number;
}

interface CustomerSummary {
  id: string;
  name: string;
  family: string;
  templates: number;
  deliveries: DeliverySummary[];
}

interface StudioState {
  workspace: string;
  customers: CustomerSummary[];
}

interface MasterInspection {
  path: string;
  projectId: string;
  name: string;
  savedAt: string;
  compositions: { id: string; name: string; width: number; height: number }[];
  colors: string[];
  assets: {
    id: string;
    filename: string;
    kind: 'image' | 'font' | 'lottie' | 'video' | 'audio';
  }[];
}

interface ApiCustomer {
  brandKit: Record<string, unknown>;
  recipe: Record<string, unknown>;
  deliveries: DeliverySummary[];
}

const mount = document.querySelector<HTMLDivElement>('#app');
if (mount === null) throw new Error('Studio mount is missing');
const app: HTMLDivElement = mount;

let studio: StudioState = { workspace: '', customers: [] };
let draft: CustomerDraft | null = null;
let selectedId: string | null = null;
let savedCustomer = false;
let busy = false;
let notice: { kind: 'success' | 'error' | 'info'; text: string } | null = null;
const inspections = new Map<number, MasterInspection>();

app.addEventListener('input', handleInput);
app.addEventListener('change', handleInput);
app.addEventListener('click', (event) => void handleClick(event));

void boot();

async function boot(): Promise<void> {
  try {
    studio = await api<StudioState>('/api/state');
    render();
  } catch (error) {
    app.innerHTML = `<main class="empty"><div class="empty-card"><h2>Studio در دسترس نیست</h2><p>${escapeHtml(messageOf(error))}</p></div></main>`;
  }
}

function render(): void {
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand"><div class="brand-mark">A</div><div><h1>Brand Pack Studio</h1><small>ابزار داخلی APASAI</small></div></div>
        <div class="workspace" title="Workspace">${escapeHtml(studio.workspace)}</div>
        <button class="primary" data-action="new-customer" ${disabled()}>مشتری جدید</button>
        <div class="customer-list" aria-label="مشتری‌ها">
          ${studio.customers.length === 0 ? '<p class="muted">هنوز مشتری‌ای ذخیره نشده است.</p>' : studio.customers.map(customerButton).join('')}
        </div>
      </aside>
      <main class="main">${draft === null ? emptyView() : editorView(draft)}</main>
    </div>`;
}

function customerButton(customer: CustomerSummary): string {
  const active = selectedId === customer.id ? ' active' : '';
  return `<button class="customer-button${active}" data-action="select-customer" data-id="${escapeAttr(customer.id)}" ${disabled()}>
    <strong>${escapeHtml(customer.name)}</strong>
    <small><bdi>${escapeHtml(customer.id)}</bdi> · ${String(customer.templates)} تمپلیت · ${String(customer.deliveries.length)} خروجی</small>
  </button>`;
}

function emptyView(): string {
  return `<div class="empty"><div class="empty-card">
    <h2>ساخت پک اختصاصی مشتری</h2>
    <p class="muted">یک مشتری را انتخاب کنید یا پروفایل جدید بسازید. فایل‌ها فقط در workspace همین سیستم ذخیره می‌شوند و وارد Designer نمی‌شوند.</p>
    <button class="primary" data-action="new-customer" ${disabled()}>ساخت اولین مشتری</button>
  </div></div>`;
}

function editorView(value: CustomerDraft): string {
  return `
    <div class="topbar">
      <div><h2>${escapeHtml(value.name || 'مشتری جدید')}</h2><small class="muted"><bdi>${escapeHtml(value.id || 'ذخیره نشده')}</bdi></small></div>
      <div class="actions">
        <button data-action="save" ${disabled()}>ذخیره</button>
        <button data-action="validate" ${disabled(!savedCustomer)}>بررسی پک</button>
        <button class="primary" data-action="build" ${disabled(!savedCustomer)}>ساخت خروجی</button>
      </div>
    </div>
    ${notice === null ? '' : `<div class="status ${notice.kind === 'info' ? '' : notice.kind}">${escapeHtml(notice.text)}</div>`}
    ${identitySection(value)}
    ${targetsSection(value)}
    ${colorsSection(value)}
    ${fontsSection(value)}
    ${assetsSection(value)}
    ${templatesSection(value)}
    ${deliveriesSection()}`;
}

function identitySection(value: CustomerDraft): string {
  return `<section class="section"><header><h3>مشخصات مشتری</h3></header><div class="grid">
    ${field('شناسه ثابت', input('id', value.id, 'text', 'ltr', savedCustomer), 'field')}
    ${field('نام مشتری', input('name', value.name), 'field wide')}
    ${field('تهیه‌کننده', input('author', value.author), 'field')}
    ${field(
      'حس حرکت',
      select('motion', value.motion, [
        ['calm', 'آرام'],
        ['news', 'خبری'],
        ['energetic', 'پرانرژی'],
      ]),
      'field',
    )}
    ${field('خانوادهٔ پک', input('family', value.family), 'field wide')}
    ${field('یادداشت‌های برندبوک؛ هر خط یک مورد', textarea('brandbookNotes', value.brandbookNotes), 'field full')}
    ${field('فایل‌های مرجع؛ هر خط یک مسیر', textarea('references', value.references), 'field full')}
  </div></section>`;
}

function targetsSection(value: CustomerDraft): string {
  return collectionSection(
    'ابعاد خروجی',
    'add-target',
    value.targets
      .map(
        (row, index) => `<div class="card"><div class="grid">
          ${field('کلید', input(`targets.${String(index)}.key`, row.key, 'text', 'ltr'), 'field')}
          ${field('عرض', input(`targets.${String(index)}.width`, row.width, 'number', 'ltr'), 'field')}
          ${field('ارتفاع', input(`targets.${String(index)}.height`, row.height, 'number', 'ltr'), 'field')}
          <div class="field"><span>&nbsp;</span><button class="danger" data-action="remove-target" data-index="${String(index)}" ${disabled(value.targets.length <= 1)}>حذف</button></div>
        </div></div>`,
      )
      .join(''),
  );
}

function colorsSection(value: CustomerDraft): string {
  return collectionSection(
    'رنگ‌های برند',
    'add-color',
    value.colors
      .map(
        (row, index) => `<div class="card"><div class="grid">
          ${field('نقش', input(`colors.${String(index)}.role`, row.role, 'text', 'ltr'), 'field')}
          ${field('رنگ', input(`colors.${String(index)}.value`, row.value, 'text', 'ltr'), 'field')}
          ${field(
            'منبع',
            select(`colors.${String(index)}.source`, row.source, [
              ['brand', 'اصلی برند'],
              ['derived', 'مشتق‌شده'],
            ]),
            'field',
          )}
          ${field('مشتق از', input(`colors.${String(index)}.derivedFrom`, row.derivedFrom, 'text', 'ltr'), 'field')}
          ${field('دلیل رنگ مشتق‌شده', input(`colors.${String(index)}.note`, row.note), 'field wide')}
          <div class="field"><span>&nbsp;</span><button class="danger" data-action="remove-color" data-index="${String(index)}" ${disabled(value.colors.length <= 1)}>حذف</button></div>
        </div></div>`,
      )
      .join(''),
  );
}

function fontsSection(value: CustomerDraft): string {
  return collectionSection(
    'فونت‌ها',
    'add-font',
    value.fonts
      .map(
        (row, index) => `<div class="card"><div class="grid">
          ${field('نقش', input(`fonts.${String(index)}.role`, row.role, 'text', 'ltr'), 'field')}
          ${field('مسیر فایل فونت', input(`fonts.${String(index)}.path`, row.path, 'text', 'ltr'), 'field wide')}
          ${field('نام خانواده', input(`fonts.${String(index)}.family`, row.family), 'field')}
          ${field('وزن', input(`fonts.${String(index)}.weight`, row.weight, 'number', 'ltr'), 'field')}
          ${field(
            'حالت',
            select(`fonts.${String(index)}.style`, row.style, [
              ['normal', 'معمولی'],
              ['italic', 'ایتالیک'],
            ]),
            'field',
          )}
          <label class="field check-field"><input data-bind="fonts.${String(index)}.licenseConfirmed" type="checkbox" ${row.licenseConfirmed ? 'checked' : ''}/> مجوز استفاده و Embed تأیید شده</label>
          ${field('یادداشت مجوز', input(`fonts.${String(index)}.licenseNote`, row.licenseNote), 'field wide')}
          <div class="field"><span>&nbsp;</span><button class="danger" data-action="remove-font" data-index="${String(index)}" ${disabled(value.fonts.length <= 1)}>حذف</button></div>
        </div></div>`,
      )
      .join(''),
  );
}

function assetsSection(value: CustomerDraft): string {
  return collectionSection(
    'لوگو و فایل‌های برند',
    'add-asset',
    value.assets
      .map(
        (row, index) => `<div class="card"><div class="grid">
          ${field('نقش', input(`assets.${String(index)}.role`, row.role, 'text', 'ltr', row.role === 'logo'), 'field')}
          ${field(
            'نوع',
            select(`assets.${String(index)}.kind`, row.kind, [
              ['image', 'تصویر'],
              ['lottie', 'Lottie'],
              ['video', 'ویدیو'],
              ['audio', 'صدا'],
            ]),
            'field',
          )}
          ${field('مسیر فایل اصلی', input(`assets.${String(index)}.sourcePath`, row.sourcePath, 'text', 'ltr'), 'field wide')}
          ${field('مسیر فایل قابل‌نمایش', input(`assets.${String(index)}.renderPath`, row.renderPath, 'text', 'ltr'), 'field wide')}
          ${field('یادداشت', input(`assets.${String(index)}.note`, row.note), 'field wide')}
          <div class="field"><span>&nbsp;</span><button class="danger" data-action="remove-asset" data-index="${String(index)}" ${disabled(row.role === 'logo' || value.assets.length <= 1)}>حذف</button></div>
        </div></div>`,
      )
      .join(''),
  );
}

function templatesSection(value: CustomerDraft): string {
  return collectionSection(
    'تمپلیت‌های این پک',
    'add-template',
    value.templates.map((row, index) => templateCard(row, index, value.templates.length)).join(''),
  );
}

function templateCard(row: TemplateRow, index: number, count: number): string {
  const inspection = inspections.get(index);
  return `<article class="card"><header><h4>${escapeHtml(row.displayName || `تمپلیت ${String(index + 1)}`)}</h4><button class="danger" data-action="remove-template" data-index="${String(index)}" ${disabled(count <= 1)}>حذف تمپلیت</button></header>
    <div class="grid">
      ${field('کلید ثابت', input(`templates.${String(index)}.key`, row.key, 'text', 'ltr'), 'field')}
      ${field('نام نمایشی', input(`templates.${String(index)}.displayName`, row.displayName), 'field wide')}
      ${field('فایل مادر .cgproj', input(`templates.${String(index)}.sourceProject`, row.sourceProject, 'text', 'ltr'), 'field wide')}
      <div class="field"><span>&nbsp;</span><button data-action="inspect" data-index="${String(index)}" ${disabled(!savedCustomer)}>بررسی فایل مادر</button></div>
      ${field('Composition ID', input(`templates.${String(index)}.compositionId`, row.compositionId, 'text', 'ltr'), 'field')}
      ${field('ابعاد هدف', input(`templates.${String(index)}.target`, row.target, 'text', 'ltr'), 'field')}
      ${field('نام فایل خروجی', input(`templates.${String(index)}.outputName`, row.outputName, 'text', 'ltr'), 'field')}
      ${field('دادهٔ پیش‌نمایش (JSON)', textarea(`templates.${String(index)}.previewData`, row.previewData), 'field full')}
      ${field('عکس Intro (ms)', input(`templates.${String(index)}.introMs`, row.introMs, 'number', 'ltr'), 'field')}
      ${field('عکس Hold (ms)', input(`templates.${String(index)}.holdMs`, row.holdMs, 'number', 'ltr'), 'field')}
      ${field('عکس Out (ms)', input(`templates.${String(index)}.outMs`, row.outMs, 'number', 'ltr'), 'field')}
    </div>
    ${mappingEditor('رنگ‌ها', 'colors', row.colors, index)}
    ${mappingEditor('فایل‌ها', 'assets', row.assets, index)}
    ${mappingEditor('فونت‌ها', 'fonts', row.fonts, index)}
    ${inspection === undefined ? '' : inspectionView(inspection)}
  </article>`;
}

function mappingEditor(
  title: string,
  kind: 'colors' | 'assets' | 'fonts',
  rows: MappingRow[],
  templateIndex: number,
): string {
  return `<div class="mapping"><h5>${title}: مقدار فایل مادر ← نقش برند</h5>
    ${rows
      .map(
        (row, index) => `<div class="mini-row">
          ${input(`templates.${String(templateIndex)}.${kind}.${String(index)}.source`, row.source, 'text', 'ltr')}
          ${input(`templates.${String(templateIndex)}.${kind}.${String(index)}.role`, row.role, 'text', 'ltr')}
          <button class="danger" data-action="remove-mapping" data-kind="${kind}" data-template="${String(templateIndex)}" data-index="${String(index)}">حذف</button>
        </div>`,
      )
      .join('')}
    <button data-action="add-mapping" data-kind="${kind}" data-template="${String(templateIndex)}">افزودن نگاشت</button>
  </div>`;
}

function inspectionView(value: MasterInspection): string {
  return `<div class="inspection"><strong>نتیجهٔ بررسی: ${escapeHtml(value.name)}</strong>
    <p class="muted ltr">${escapeHtml(value.path)}</p>
    <div class="chips">${value.compositions.map((item) => `<span class="chip">${escapeHtml(item.name)} · <code>${escapeHtml(item.id)}</code> · ${String(item.width)}×${String(item.height)}</span>`).join('')}</div>
    <div class="chips">${value.colors.map((item) => `<span class="chip"><code>${escapeHtml(item)}</code></span>`).join('')}</div>
    <div class="chips">${value.assets.map((item) => `<span class="chip">${escapeHtml(item.kind)} · ${escapeHtml(item.filename)} · <code>${escapeHtml(item.id)}</code></span>`).join('')}</div>
  </div>`;
}

function deliveriesSection(): string {
  const customer = studio.customers.find((item) => item.id === selectedId);
  const deliveries = customer?.deliveries ?? [];
  return `<section class="section"><header><h3>خروجی‌های قبلی</h3></header><div class="delivery-list">
    ${deliveries.length === 0 ? '<p class="muted">هنوز خروجی کاملی ساخته نشده است.</p>' : deliveries.map(deliveryRow).join('')}
  </div></section>`;
}

function deliveryRow(value: DeliverySummary): string {
  const base = `/delivery/${encodeURIComponent(selectedId ?? '')}/${encodeURIComponent(value.name)}`;
  const status =
    value.status === 'complete' ? 'کامل' : value.status === 'incomplete' ? 'ناقص' : 'نامشخص';
  return `<div class="delivery"><div><strong><bdi>${escapeHtml(value.name)}</bdi></strong><div class="muted">${status} · ${String(value.templates)} تمپلیت</div></div><div class="row-actions"><a href="${base}/contact-sheet.html" target="_blank" rel="noreferrer">Contact sheet</a><a href="${base}/pack-report.json" target="_blank" rel="noreferrer">گزارش JSON</a></div></div>`;
}

function collectionSection(title: string, addAction: string, content: string): string {
  return `<section class="section"><header><h3>${title}</h3><button data-action="${addAction}" ${disabled()}>افزودن</button></header>${content}</section>`;
}

function field(label: string, control: string, className: string): string {
  return `<label class="${className}"><span>${label}</span>${control}</label>`;
}

function input(
  binding: string,
  value: string | number,
  type = 'text',
  className = '',
  readonly = false,
): string {
  return `<input data-bind="${binding}" type="${type}" value="${escapeAttr(String(value))}" class="${className}" ${readonly ? 'readonly' : ''} ${disabled()}/>`;
}

function textarea(binding: string, value: string): string {
  return `<textarea data-bind="${binding}" ${disabled()}>${escapeHtml(value)}</textarea>`;
}

function select(binding: string, value: string, options: [string, string][]): string {
  return `<select data-bind="${binding}" ${disabled()}>${options.map(([key, label]) => `<option value="${escapeAttr(key)}" ${key === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>`;
}

function handleInput(event: Event): void {
  if (draft === null) return;
  const element = event.target;
  if (
    !(
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement
    )
  )
    return;
  const binding = element.dataset['bind'];
  if (binding === undefined) return;
  const value =
    element instanceof HTMLInputElement && element.type === 'checkbox'
      ? element.checked
      : element instanceof HTMLInputElement && element.type === 'number'
        ? Number(element.value)
        : element.value;
  setPath(draft as unknown as Record<string, unknown>, binding, value);
  notice = null;
}

async function handleClick(event: Event): Promise<void> {
  const target =
    event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null;
  if (target === null || busy) return;
  const action = target.dataset['action'];
  if (action === undefined) return;
  if (action === 'new-customer') {
    selectedId = null;
    savedCustomer = false;
    inspections.clear();
    draft = blankDraft();
    notice = null;
    render();
    return;
  }
  if (action === 'select-customer') {
    await selectCustomer(target.dataset['id'] ?? '');
    return;
  }
  if (draft === null) return;

  if (action.startsWith('add-') || action.startsWith('remove-')) {
    mutateCollection(action, target);
    render();
    return;
  }
  if (action === 'save') await saveCustomer();
  if (action === 'validate') await validateCustomer();
  if (action === 'build') await buildCustomer();
  if (action === 'inspect') await inspectMaster(Number(target.dataset['index']));
}

function mutateCollection(action: string, target: HTMLElement): void {
  if (draft === null) return;
  const index = Number(target.dataset['index']);
  if (action === 'add-target') draft.targets.push({ key: 'hd', width: 1920, height: 1080 });
  if (action === 'remove-target') draft.targets.splice(index, 1);
  if (action === 'add-color')
    draft.colors.push({ role: '', value: '#FFFFFF', source: 'brand', derivedFrom: '', note: '' });
  if (action === 'remove-color') draft.colors.splice(index, 1);
  if (action === 'add-font')
    draft.fonts.push({
      role: '',
      path: '',
      family: '',
      weight: 400,
      style: 'normal',
      licenseConfirmed: false,
      licenseNote: '',
    });
  if (action === 'remove-font') draft.fonts.splice(index, 1);
  if (action === 'add-asset')
    draft.assets.push({ role: '', kind: 'image', sourcePath: '', renderPath: '', note: '' });
  if (action === 'remove-asset') draft.assets.splice(index, 1);
  if (action === 'add-template') draft.templates.push(blankTemplate());
  if (action === 'remove-template') draft.templates.splice(index, 1);
  if (action === 'add-mapping' || action === 'remove-mapping') {
    const template = draft.templates[Number(target.dataset['template'])];
    const kind = target.dataset['kind'];
    if (template !== undefined && (kind === 'colors' || kind === 'assets' || kind === 'fonts')) {
      if (action === 'add-mapping') template[kind].push({ source: '', role: '' });
      else template[kind].splice(index, 1);
    }
  }
  notice = null;
}

async function selectCustomer(id: string): Promise<void> {
  await runBusy(async () => {
    const response = await api<ApiCustomer>(`/api/customers/${encodeURIComponent(id)}`);
    selectedId = id;
    savedCustomer = true;
    inspections.clear();
    draft = fromDocuments(response.brandKit, response.recipe);
    notice = null;
  });
}

async function saveCustomer(): Promise<void> {
  if (draft === null) return;
  await runBusy(async () => {
    const documents = toDocuments(draft as CustomerDraft);
    const id = draft?.id.trim() ?? '';
    if (id === '') throw new Error('شناسهٔ ثابت مشتری را وارد کنید.');
    await api<ApiCustomer>(`/api/customers/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(documents),
    });
    selectedId = id;
    savedCustomer = true;
    studio = await api<StudioState>('/api/state');
    notice = { kind: 'success', text: 'پروفایل مشتری ذخیره شد.' };
  });
}

async function validateCustomer(): Promise<void> {
  if (selectedId === null) return;
  await runBusy(async () => {
    await saveWithoutBusy();
    const response = await api<{ templates: unknown[] }>(
      `/api/customers/${encodeURIComponent(selectedId ?? '')}/validate`,
      { method: 'POST' },
    );
    notice = {
      kind: 'success',
      text: `پک معتبر است؛ ${String(response.templates.length)} تمپلیت آمادهٔ ساخت است.`,
    };
  });
}

async function buildCustomer(): Promise<void> {
  if (selectedId === null) return;
  await runBusy(async () => {
    await saveWithoutBusy();
    notice = { kind: 'info', text: 'در حال ساخت و کنترل تصویری خروجی…' };
    render();
    const response = await api<{ delivery: string }>(
      `/api/customers/${encodeURIComponent(selectedId ?? '')}/build`,
      { method: 'POST' },
    );
    studio = await api<StudioState>('/api/state');
    notice = { kind: 'success', text: `خروجی کامل ساخته شد: ${response.delivery}` };
  });
}

async function inspectMaster(index: number): Promise<void> {
  if (draft === null || selectedId === null) return;
  const template = draft.templates[index];
  if (template === undefined) return;
  await runBusy(async () => {
    await saveWithoutBusy();
    const response = await api<{ inspection: MasterInspection }>(
      `/api/customers/${encodeURIComponent(selectedId ?? '')}/inspect`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceProject: template.sourceProject }),
      },
    );
    inspections.set(index, response.inspection);
    notice = { kind: 'success', text: 'فایل مادر بدون تغییر بررسی شد.' };
  });
}

async function saveWithoutBusy(): Promise<void> {
  if (draft === null) return;
  const documents = toDocuments(draft);
  const id = draft.id.trim();
  await api<ApiCustomer>(`/api/customers/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(documents),
  });
  selectedId = id;
  savedCustomer = true;
}

async function runBusy(action: () => Promise<void>): Promise<void> {
  busy = true;
  notice = { kind: 'info', text: 'در حال انجام…' };
  render();
  try {
    await action();
  } catch (error) {
    notice = { kind: 'error', text: messageOf(error) };
  } finally {
    busy = false;
    render();
  }
}

function blankDraft(): CustomerDraft {
  return {
    id: '',
    name: '',
    author: 'APASAI CG Studio',
    motion: 'news',
    targets: [{ key: 'hd', width: 1920, height: 1080 }],
    colors: [{ role: 'primary', value: '#164E63', source: 'brand', derivedFrom: '', note: '' }],
    fonts: [
      {
        role: 'display',
        path: '',
        family: '',
        weight: 700,
        style: 'normal',
        licenseConfirmed: false,
        licenseNote: '',
      },
    ],
    assets: [{ role: 'logo', kind: 'image', sourcePath: '', renderPath: '', note: '' }],
    brandbookNotes: '',
    references: '',
    family: 'Essentials v1',
    templates: [blankTemplate()],
  };
}

function blankTemplate(): TemplateRow {
  return {
    key: 'lower-third',
    sourceProject: '',
    compositionId: '',
    target: 'hd',
    displayName: 'Lower Third',
    outputName: 'lower-third.vcg',
    colors: [],
    assets: [],
    fonts: [],
    previewData: '{}',
    introMs: 100,
    holdMs: 900,
    outMs: 120,
  };
}

function fromDocuments(
  brandKit: Record<string, unknown>,
  recipe: Record<string, unknown>,
): CustomerDraft {
  const colors = record(brandKit['colors']);
  const fonts = record(brandKit['fonts']);
  const assets = record(brandKit['assets']);
  const templates = arrayOfRecords(recipe['templates']);
  return {
    id: stringValue(brandKit['id']),
    name: stringValue(brandKit['name']),
    author: stringValue(brandKit['author']),
    motion: enumValue(brandKit['motion'], ['calm', 'news', 'energetic'], 'news'),
    targets: arrayOfRecords(brandKit['targets']).map((row) => ({
      key: stringValue(row['key']),
      width: numberValue(row['width'], 1920),
      height: numberValue(row['height'], 1080),
    })),
    colors: Object.entries(colors).map(([role, raw]) => {
      const row = record(raw);
      return {
        role,
        value: stringValue(row['value']),
        source: enumValue(row['source'], ['brand', 'derived'], 'brand'),
        derivedFrom: stringValue(row['derivedFrom']),
        note: stringValue(row['note']),
      };
    }),
    fonts: Object.entries(fonts).map(([role, raw]) => {
      const row = record(raw);
      return {
        role,
        path: stringValue(row['path']),
        family: stringValue(row['family']),
        weight: numberValue(row['weight'], 400),
        style: enumValue(row['style'], ['normal', 'italic'], 'normal'),
        licenseConfirmed: row['licenseConfirmed'] === true,
        licenseNote: stringValue(row['licenseNote']),
      };
    }),
    assets: Object.entries(assets).map(([role, raw]) => {
      const row = record(raw);
      return {
        role,
        kind: enumValue(row['kind'], ['image', 'lottie', 'video', 'audio'], 'image'),
        sourcePath: stringValue(row['sourcePath']),
        renderPath: stringValue(row['renderPath']),
        note: stringValue(row['note']),
      };
    }),
    brandbookNotes: stringArray(brandKit['brandbookNotes']).join('\n'),
    references: stringArray(brandKit['references']).join('\n'),
    family: stringValue(recipe['family']),
    templates: templates.map((row) => {
      const preview = record(row['preview']);
      return {
        key: stringValue(row['key']),
        sourceProject: stringValue(row['sourceProject']),
        compositionId: stringValue(row['compositionId']),
        target: stringValue(row['target']),
        displayName: stringValue(row['displayName']),
        outputName: stringValue(row['outputName']),
        colors: mappingRows(row['colors']),
        assets: mappingRows(row['assets']),
        fonts: mappingRows(row['fonts']),
        previewData: JSON.stringify(record(preview['data']), null, 2),
        introMs: numberValue(preview['introMs'], 100),
        holdMs: numberValue(preview['holdMs'], 900),
        outMs: numberValue(preview['outMs'], 120),
      };
    }),
  };
}

function toDocuments(value: CustomerDraft): { brandKit: unknown; recipe: unknown } {
  const previewData = value.templates.map((template) => parseObjectJson(template.previewData));
  return {
    brandKit: {
      schemaVersion: 1,
      id: value.id.trim(),
      name: value.name.trim(),
      ...(value.author.trim() === '' ? {} : { author: value.author.trim() }),
      motion: value.motion,
      targets: value.targets.map((target) => ({
        key: target.key.trim(),
        width: target.width,
        height: target.height,
      })),
      colors: Object.fromEntries(
        value.colors.map((color) => [
          color.role.trim(),
          color.source === 'derived'
            ? {
                value: color.value.trim(),
                source: color.source,
                derivedFrom: color.derivedFrom.trim(),
                note: color.note.trim(),
              }
            : { value: color.value.trim(), source: color.source },
        ]),
      ),
      fonts: Object.fromEntries(
        value.fonts.map((font) => [
          font.role.trim(),
          {
            path: font.path.trim(),
            family: font.family.trim(),
            weight: font.weight,
            style: font.style,
            licenseConfirmed: font.licenseConfirmed,
            licenseNote: font.licenseNote.trim(),
          },
        ]),
      ),
      assets: Object.fromEntries(
        value.assets.map((asset) => [
          asset.role.trim(),
          {
            kind: asset.kind,
            sourcePath: asset.sourcePath.trim(),
            ...(asset.renderPath.trim() === '' ? {} : { renderPath: asset.renderPath.trim() }),
            ...(asset.note.trim() === '' ? {} : { note: asset.note.trim() }),
          },
        ]),
      ),
      brandbookNotes: lines(value.brandbookNotes),
      references: lines(value.references),
    },
    recipe: {
      schemaVersion: 1,
      family: value.family.trim(),
      templates: value.templates.map((template, index) => ({
        key: template.key.trim(),
        sourceProject: template.sourceProject.trim(),
        ...(template.compositionId.trim() === ''
          ? {}
          : { compositionId: template.compositionId.trim() }),
        target: template.target.trim(),
        displayName: template.displayName.trim(),
        ...(template.outputName.trim() === '' ? {} : { outputName: template.outputName.trim() }),
        colors: mappingRecord(template.colors),
        assets: mappingRecord(template.assets),
        fonts: mappingRecord(template.fonts),
        preview: {
          data: previewData[index] ?? {},
          introMs: template.introMs,
          holdMs: template.holdMs,
          outMs: template.outMs,
        },
      })),
    },
  };
}

function setPath(root: Record<string, unknown>, pathValue: string, value: unknown): void {
  const pieces = pathValue.split('.');
  let cursor: unknown = root;
  for (let index = 0; index < pieces.length - 1; index += 1) {
    const piece = pieces[index] ?? '';
    cursor = Array.isArray(cursor)
      ? cursor[Number(piece)]
      : (cursor as Record<string, unknown>)[piece];
  }
  const last = pieces.at(-1) ?? '';
  if (Array.isArray(cursor)) cursor[Number(last)] = value;
  else (cursor as Record<string, unknown>)[last] = value;
}

function mappingRows(value: unknown): MappingRow[] {
  return Object.entries(record(value)).map(([source, role]) => ({
    source,
    role: stringValue(role),
  }));
}

function mappingRecord(rows: MappingRow[]): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [row.source.trim(), row.role.trim()]));
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseObjectJson(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error('دادهٔ پیش‌نمایش باید JSON معتبر باشد.');
  }
  return record(parsed);
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}
function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function enumValue<const T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : fallback;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json()) as { error?: { message?: string } } & T;
  if (!response.ok) throw new Error(body.error?.message ?? `HTTP ${String(response.status)}`);
  return body;
}

function disabled(extra = false): string {
  return busy || extra ? 'disabled' : '';
}
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function escapeAttr(value: string): string {
  return escapeHtml(value);
}
