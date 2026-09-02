// Rivals 2 event passes. Each event track grants 20% bonus event XP while you
// have an eligible skin equipped, so these lists are "characters that have at
// least one bonus-XP skin" rather than a list of the skins themselves.
//
// Sources are the Steam patch notes for the patch that launched each event.
// Events ran monthly until Pool Party Splashback moved them to a 3-month
// rotation, so `ends` is the next event's start date (or, for the current
// event, its announced 3-month length).

export interface RivalsEvent {
  id: string;
  name: string;
  reward: string;
  /** ISO date the event track opened. */
  starts: string;
  /** ISO date the event track closed; approximate for the running event. */
  ends: string;
  /** Characters with at least one bonus-XP skin, by roster name. */
  characters: string[];
}

export const EVENTS: RivalsEvent[] = [
  {
    // Patch 1.7.1 — Mecha Bundle (Zetterburn, Ranno, Gouie), free track
    // (Cyber Forsburn, Cyber Clairen), plus returning Mecha/Ranger/Cyber and
    // Dark Future skins.
    id: 'mecha-madness-gx',
    name: 'Mecha Madness GX',
    reward: '20% bonus event XP',
    starts: '2026-09-01',
    ends: '2026-12-01',
    characters: [
      'Zetterburn',
      'Clairen',
      'Loxodont',
      'Forsburn',
      'Kragg',
      'Wrastor',
      'Fleet',
      'Absa',
      'Ranno',
      'Etalus',
      'Gouie',
    ],
  },
  {
    // Patch 1.6.4 — Pool Party bundle (Slade, Orcane), free track
    // (Pool Party Olympia), plus the returning Pool Party skins.
    id: 'pool-party-splashback',
    name: 'Pool Party Splashback',
    reward: '20% bonus event XP',
    starts: '2026-06-02',
    ends: '2026-09-01',
    characters: ['Clairen', 'Loxodont', 'Forsburn', 'Olympia', 'Absa', 'Ranno', 'Orcane', 'Slade'],
  },
  {
    // Patch 1.6.2 — Dreamscape bundle (Pajama La Reina, Pajama Zetterburn),
    // free track (Quilted Forsburn), plus Night Owl Fleet, Clown Ranno,
    // Santa Zetterburn and Early Bird Wrastor.
    id: 'dreamscape',
    name: 'Dreamscape',
    reward: '20% bonus event XP',
    starts: '2026-05-05',
    ends: '2026-06-02',
    characters: ['Zetterburn', 'Forsburn', 'La Reina', 'Wrastor', 'Fleet', 'Ranno'],
  },
];

export interface AnnotatedEvent extends RivalsEvent {
  /** How many of the event's characters are actually on the roster. */
  matching: number;
  active: boolean;
}

// Annotates events for display, newest first. `now` decides which events are
// still running; pass null to treat every event as past.
export function annotateEvents(
  events: RivalsEvent[],
  rosterNames: string[],
  now: Date | null
): AnnotatedEvent[] {
  const roster = new Set(rosterNames);

  return events
    .map((event) => ({
      ...event,
      matching: event.characters.filter((name) => roster.has(name)).length,
      active: now !== null && new Date(event.starts) <= now && new Date(event.ends) > now,
    }))
    .sort((a, b) => b.ends.localeCompare(a.ends));
}
