import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { BrandKit, PackRecipe } from './schema.js';
import { BrandKitSchema, PackRecipeSchema } from './schema.js';
import { PackFactoryError, zodMessage } from './errors.js';
import {
  REPOSITORY_ROOT,
  assertOutsideRepository,
  canonicalPathForCreation,
  canonicalReadableFile,
  isInside,
  safeOutputPath,
} from './paths.js';

const CUSTOMER_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BRAND_KIT_FILE = 'brandkit.json';
const RECIPE_FILE = 'pack.json';
const DELIVERIES_DIRECTORY = 'deliveries';

export interface StudioWorkspace {
  root: string;
  customersRoot: string;
}

export interface StudioCustomer {
  id: string;
  directory: string;
  brandKitPath: string;
  recipePath: string;
  brandKit: BrandKit;
  recipe: PackRecipe;
}

export interface StudioDeliverySummary {
  name: string;
  createdAt: string;
  status: 'complete' | 'incomplete' | 'unknown';
  templates: number;
}

export interface StudioCustomerSummary {
  id: string;
  name: string;
  family: string;
  templates: number;
  deliveries: StudioDeliverySummary[];
}

export function defaultStudioWorkspace(): string {
  return path.join(os.homedir(), 'APASAI CG', 'Brand Pack Studio');
}

export async function openStudioWorkspace(
  requestedRoot: string,
  repositoryRoot = REPOSITORY_ROOT,
): Promise<StudioWorkspace> {
  const candidate = safeOutputPath(await canonicalPathForCreation(path.resolve(requestedRoot)));
  assertOutsideRepository(candidate, 'Brand Pack Studio workspace', repositoryRoot);
  await fs.mkdir(path.join(candidate, 'customers'), { recursive: true });
  const root = await fs.realpath(candidate);
  assertOutsideRepository(root, 'Brand Pack Studio workspace', repositoryRoot);
  const customersRoot = path.join(root, 'customers');
  return { root, customersRoot };
}

export async function listStudioCustomers(
  workspace: StudioWorkspace,
): Promise<StudioCustomerSummary[]> {
  const entries = await fs.readdir(workspace.customersRoot, { withFileTypes: true });
  const customers: StudioCustomerSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !CUSTOMER_ID.test(entry.name)) continue;
    try {
      const customer = await readStudioCustomer(workspace, entry.name);
      customers.push({
        id: customer.id,
        name: customer.brandKit.name,
        family: customer.recipe.family,
        templates: customer.recipe.templates.length,
        deliveries: await listStudioDeliveries(workspace, customer.id),
      });
    } catch {
      // A manually damaged/incomplete directory is not a customer until both canonical
      // documents validate. Its bytes stay untouched for manual recovery.
    }
  }
  return customers.sort((left, right) => left.name.localeCompare(right.name, 'fa'));
}

export async function readStudioCustomer(
  workspace: StudioWorkspace,
  customerId: string,
): Promise<StudioCustomer> {
  const directory = customerDirectory(workspace, customerId);
  const brandKitPath = path.join(directory, BRAND_KIT_FILE);
  const recipePath = path.join(directory, RECIPE_FILE);
  const brandRaw = await readJson(brandKitPath, 'Brand Kit');
  const recipeRaw = await readJson(recipePath, 'Pack recipe');
  const brandParsed = BrandKitSchema.safeParse(brandRaw);
  if (!brandParsed.success) {
    throw new PackFactoryError('invalid-brand-kit', zodMessage('Brand Kit', brandParsed.error));
  }
  if (brandParsed.data.id !== customerId) {
    throw new PackFactoryError(
      'customer-id-mismatch',
      `Customer folder "${customerId}" contains Brand Kit id "${brandParsed.data.id}"`,
    );
  }
  const recipeParsed = PackRecipeSchema.safeParse(recipeRaw);
  if (!recipeParsed.success) {
    throw new PackFactoryError('invalid-recipe', zodMessage('Pack recipe', recipeParsed.error));
  }
  return {
    id: customerId,
    directory,
    brandKitPath,
    recipePath,
    brandKit: brandParsed.data,
    recipe: recipeParsed.data,
  };
}

export async function saveStudioCustomer(
  workspace: StudioWorkspace,
  customerId: string,
  input: { brandKit: unknown; recipe: unknown },
): Promise<StudioCustomer> {
  assertCustomerId(customerId);
  const brandParsed = BrandKitSchema.safeParse(input.brandKit);
  if (!brandParsed.success) {
    throw new PackFactoryError('invalid-brand-kit', zodMessage('Brand Kit', brandParsed.error));
  }
  if (brandParsed.data.id !== customerId) {
    throw new PackFactoryError('customer-id-immutable', `Brand Kit id must remain "${customerId}"`);
  }
  const recipeParsed = PackRecipeSchema.safeParse(input.recipe);
  if (!recipeParsed.success) {
    throw new PackFactoryError('invalid-recipe', zodMessage('Pack recipe', recipeParsed.error));
  }

  const directory = customerDirectory(workspace, customerId);
  await fs.mkdir(path.join(directory, DELIVERIES_DIRECTORY), { recursive: true });
  await writeJsonAtomic(path.join(directory, BRAND_KIT_FILE), brandParsed.data);
  await writeJsonAtomic(path.join(directory, RECIPE_FILE), recipeParsed.data);
  return readStudioCustomer(workspace, customerId);
}

export async function listStudioDeliveries(
  workspace: StudioWorkspace,
  customerId: string,
): Promise<StudioDeliverySummary[]> {
  const root = path.join(customerDirectory(workspace, customerId), DELIVERIES_DIRECTORY);
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const deliveries: StudioDeliverySummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-z0-9][a-z0-9._-]*$/i.test(entry.name)) continue;
    const reportPath = path.join(root, entry.name, 'pack-report.json');
    let status: StudioDeliverySummary['status'] = 'unknown';
    let templates = 0;
    try {
      const report = (await readJson(reportPath, 'Pack report')) as {
        status?: unknown;
        templates?: unknown;
      };
      if (report.status === 'complete' || report.status === 'incomplete') status = report.status;
      if (Array.isArray(report.templates)) templates = report.templates.length;
    } catch {
      // An interrupted/manual delivery remains visible as unknown instead of disappearing.
    }
    const stat = await fs.stat(path.join(root, entry.name));
    deliveries.push({
      name: entry.name,
      createdAt: stat.birthtime.toISOString(),
      status,
      templates,
    });
  }
  return deliveries.sort((left, right) => right.name.localeCompare(left.name));
}

export async function nextStudioDeliveryPath(
  workspace: StudioWorkspace,
  customerId: string,
  now = new Date(),
): Promise<string> {
  const root = path.join(customerDirectory(workspace, customerId), DELIVERIES_DIRECTORY);
  await fs.mkdir(root, { recursive: true });
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').replace('Z', 'Z');
  for (let suffix = 0; suffix < 1_000; suffix += 1) {
    const name = suffix === 0 ? stamp : `${stamp}-${String(suffix)}`;
    const candidate = path.join(root, name);
    try {
      await fs.access(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return candidate;
      throw error;
    }
  }
  throw new PackFactoryError('delivery-name-exhausted', 'Could not allocate a delivery directory');
}

export async function resolveStudioDeliveryFile(
  workspace: StudioWorkspace,
  customerId: string,
  deliveryName: string,
  relativeFile: string,
): Promise<string> {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(deliveryName)) {
    throw new PackFactoryError('invalid-delivery', 'Invalid delivery name');
  }
  const deliveryRoot = path.join(
    customerDirectory(workspace, customerId),
    DELIVERIES_DIRECTORY,
    deliveryName,
  );
  const candidate = await canonicalReadableFile(
    path.resolve(deliveryRoot, relativeFile),
    'Delivery file',
  );
  const canonicalRoot = await fs.realpath(deliveryRoot);
  if (!isInside(canonicalRoot, candidate)) {
    throw new PackFactoryError('unsafe-delivery-path', 'Delivery file escapes its directory');
  }
  return candidate;
}

export function customerDirectory(workspace: StudioWorkspace, customerId: string): string {
  assertCustomerId(customerId);
  const directory = path.resolve(workspace.customersRoot, customerId);
  if (!isInside(workspace.customersRoot, directory)) {
    throw new PackFactoryError('unsafe-customer-path', 'Customer path escapes the workspace');
  }
  return directory;
}

function assertCustomerId(value: string): void {
  if (!CUSTOMER_ID.test(value)) {
    throw new PackFactoryError(
      'invalid-customer-id',
      'Customer id must use lowercase letters, digits and single hyphens',
    );
  }
}

async function readJson(file: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
  } catch (error) {
    throw new PackFactoryError(
      'invalid-json',
      `${label} is not readable JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const temporary = `${file}.tmp-${String(process.pid)}-${String(Date.now())}`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  try {
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}
