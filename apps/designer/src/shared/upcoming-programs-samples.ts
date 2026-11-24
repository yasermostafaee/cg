import type { UpcomingProgramsElement } from '@cg/shared-schema';

type SampleItem = UpcomingProgramsElement['sampleItems'][number];

export const DEFAULT_UPCOMING_PROGRAMS_ITEMS: readonly SampleItem[] = [
  { id: 'program-1', title: 'The Night Report', airtime: '20:00' },
  { id: 'program-2', title: 'Cities After Dark', airtime: '20:30' },
  { id: 'program-3', title: 'Into the Wild', airtime: '21:15' },
  { id: 'program-4', title: 'The Long View', airtime: '22:00' },
  { id: 'program-5', title: 'Studio Sessions', airtime: '23:30' },
  { id: 'program-6', title: 'Coastline Stories', airtime: '00:15' },
  { id: 'program-7', title: 'Morning Edition', airtime: '06:00' },
];
