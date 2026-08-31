import type { CaseLocationKind, CasePriority } from './domain.js';

export interface Localized {
  sv: string;
  en: string;
}

export interface TriageOption {
  value: string;
  label: Localized;
  /** Sätter ärendet i akutflöde när alternativet väljs. */
  escalates?: boolean;
}

export interface TriageQuestion {
  id: string;
  label: Localized;
  help?: Localized;
  type: 'boolean' | 'single_choice' | 'text';
  required: boolean;
  options?: TriageOption[];
  /** Visas bara när ett tidigare svar har ett visst värde. */
  showWhen?: { questionId: string; equals: string };
}

export interface CaseSubcategory {
  key: string;
  label: Localized;
  priority: CasePriority;
  triage: TriageQuestion[];
  /** Visas direkt i formuläret när svaren tyder på en akut situation. */
  emergencyGuidance?: Localized;
}

export interface CaseCategory {
  key: string;
  label: Localized;
  /** Kort ledtext i valet, hjälper hyresgästen välja rätt (krav A.2.6). */
  hint: Localized;
  locationKinds: readonly CaseLocationKind[];
  /** Ärenden i kategorin behandlas som känsliga och kräver utökad behörighet. */
  sensitive?: boolean;
  subcategories: CaseSubcategory[];
}

const YES_NO = (escalateOnYes: boolean): TriageOption[] => [
  { value: 'yes', label: { sv: 'Ja', en: 'Yes' }, escalates: escalateOnYes },
  { value: 'no', label: { sv: 'Nej', en: 'No' } },
  { value: 'unknown', label: { sv: 'Vet inte', en: 'Not sure' } },
];

const ongoingQuestion = (sv: string, en: string): TriageQuestion => ({
  id: 'ongoing',
  label: { sv, en },
  type: 'single_choice',
  required: true,
  options: YES_NO(true),
});

const damageRiskQuestion: TriageQuestion = {
  id: 'damage_risk',
  label: {
    sv: 'Finns risk för person- eller egendomsskada?',
    en: 'Is there a risk of injury or property damage?',
  },
  type: 'single_choice',
  required: true,
  options: YES_NO(true),
};

/**
 * Kategoriträd för felanmälan med följdfrågor.
 *
 * Följdfrågorna är avsiktligt korta. Syftet är att hyresgästen ska kunna beskriva
 * felet tydligt utan fackspråk, och att akuta situationer ska fångas direkt i
 * formuläret i stället för att hamna i en vanlig kö (avsnitt 5 i kravbilden).
 */
export const CASE_CATEGORIES: CaseCategory[] = [
  {
    key: 'water_drainage',
    label: { sv: 'Vatten och avlopp', en: 'Water and drainage' },
    hint: { sv: 'Läckage, stopp, dålig lukt eller inget vatten', en: 'Leaks, blockages, odour or no water' },
    locationKinds: ['residence', 'common_area'],
    subcategories: [
      {
        key: 'leak',
        label: { sv: 'Vattenläcka', en: 'Water leak' },
        priority: 'emergency',
        emergencyGuidance: {
          sv: 'Vid pågående läckage: stäng av vattnet om du kan och ring fastighetsjouren direkt. Skicka anmälan efteråt.',
          en: 'If water is still leaking: shut off the water if you can and call the emergency line now. Submit the report afterwards.',
        },
        triage: [
          ongoingQuestion('Pågår läckan just nu?', 'Is the leak happening right now?'),
          {
            id: 'can_shut_off',
            label: { sv: 'Går det att stänga av vattnet?', en: 'Can the water be shut off?' },
            type: 'single_choice',
            required: true,
            options: [
              { value: 'yes', label: { sv: 'Ja, jag har stängt av', en: 'Yes, I have shut it off' } },
              { value: 'no', label: { sv: 'Nej', en: 'No' }, escalates: true },
              { value: 'unknown', label: { sv: 'Vet inte', en: 'Not sure' } },
            ],
          },
          damageRiskQuestion,
          {
            id: 'source',
            label: { sv: 'Var kommer vattnet ifrån?', en: 'Where is the water coming from?' },
            type: 'text',
            required: false,
          },
        ],
      },
      {
        key: 'blockage',
        label: { sv: 'Stopp i avlopp', en: 'Blocked drain' },
        priority: 'high',
        triage: [
          {
            id: 'overflow',
            label: { sv: 'Svämmar det över?', en: 'Is it overflowing?' },
            type: 'single_choice',
            required: true,
            options: YES_NO(true),
          },
          {
            id: 'which_drain',
            label: { sv: 'Vilket avlopp gäller det?', en: 'Which drain is affected?' },
            type: 'single_choice',
            required: true,
            options: [
              { value: 'toilet', label: { sv: 'Toalett', en: 'Toilet' } },
              { value: 'shower', label: { sv: 'Dusch eller badkar', en: 'Shower or bath' } },
              { value: 'sink', label: { sv: 'Handfat', en: 'Sink' } },
              { value: 'kitchen', label: { sv: 'Diskho', en: 'Kitchen sink' } },
              { value: 'floor', label: { sv: 'Golvbrunn', en: 'Floor drain' } },
            ],
          },
        ],
      },
      {
        key: 'no_water',
        label: { sv: 'Inget vatten', en: 'No water' },
        priority: 'high',
        triage: [
          {
            id: 'scope',
            label: { sv: 'Vad saknar vatten?', en: 'What has no water?' },
            type: 'single_choice',
            required: true,
            options: [
              { value: 'one_tap', label: { sv: 'En kran', en: 'One tap' } },
              { value: 'whole_home', label: { sv: 'Hela bostaden', en: 'The whole home' } },
              { value: 'hot_only', label: { sv: 'Bara varmvattnet', en: 'Only hot water' } },
            ],
          },
        ],
      },
    ],
  },
  {
    key: 'electricity',
    label: { sv: 'El', en: 'Electricity' },
    hint: { sv: 'Strömavbrott, uttag, belysning eller säkringar', en: 'Outages, sockets, lighting or fuses' },
    locationKinds: ['residence', 'common_area'],
    subcategories: [
      {
        key: 'power_outage',
        label: { sv: 'Strömavbrott', en: 'Power outage' },
        priority: 'emergency',
        emergencyGuidance: {
          sv: 'Rör aldrig skadade sladdar eller uttag. Vid rök, brandlukt eller gnistor – ring 112.',
          en: 'Never touch damaged cables or sockets. If you notice smoke, a burning smell or sparks, call 112.',
        },
        triage: [
          {
            id: 'scope',
            label: { sv: 'Vad är strömlöst?', en: 'What has no power?' },
            type: 'single_choice',
            required: true,
            options: [
              { value: 'one_socket', label: { sv: 'Ett uttag', en: 'One socket' } },
              { value: 'one_room', label: { sv: 'Ett rum', en: 'One room' } },
              { value: 'whole_home', label: { sv: 'Hela bostaden', en: 'The whole home' } },
              { value: 'building', label: { sv: 'Hela huset', en: 'The whole building' }, escalates: true },
            ],
          },
          {
            id: 'burning_smell',
            label: { sv: 'Luktar det bränt eller ser du gnistor?', en: 'Is there a burning smell or sparks?' },
            type: 'single_choice',
            required: true,
            options: YES_NO(true),
          },
        ],
      },
      {
        key: 'lighting',
        label: { sv: 'Belysning', en: 'Lighting' },
        priority: 'normal',
        triage: [
          {
            id: 'where',
            label: { sv: 'Var sitter belysningen?', en: 'Where is the light fitting?' },
            type: 'text',
            required: false,
          },
        ],
      },
      {
        key: 'socket',
        label: { sv: 'Uttag eller strömbrytare', en: 'Socket or switch' },
        priority: 'normal',
        triage: [
          {
            id: 'visible_damage',
            label: { sv: 'Syns skada på uttaget?', en: 'Is there visible damage to the socket?' },
            type: 'single_choice',
            required: true,
            options: YES_NO(true),
          },
        ],
      },
    ],
  },
  {
    key: 'heating',
    label: { sv: 'Värme', en: 'Heating' },
    hint: { sv: 'Kalla element, för varmt eller ljud från värmen', en: 'Cold radiators, overheating or noise' },
    locationKinds: ['residence', 'common_area'],
    subcategories: [
      {
        key: 'no_heat',
        label: { sv: 'Kallt i bostaden', en: 'Cold home' },
        priority: 'high',
        triage: [
          {
            id: 'temperature',
            label: { sv: 'Vad visar termometern inomhus?', en: 'What does the indoor thermometer show?' },
            type: 'single_choice',
            required: true,
            options: [
              { value: 'below_18', label: { sv: 'Under 18 grader', en: 'Below 18 °C' }, escalates: true },
              { value: '18_20', label: { sv: '18–20 grader', en: '18–20 °C' } },
              { value: 'above_20', label: { sv: 'Över 20 grader', en: 'Above 20 °C' } },
              { value: 'unknown', label: { sv: 'Vet inte', en: 'Not sure' } },
            ],
          },
          {
            id: 'radiators',
            label: { sv: 'Är alla element kalla?', en: 'Are all radiators cold?' },
            type: 'single_choice',
            required: true,
            options: YES_NO(false),
          },
        ],
      },
      {
        key: 'noise',
        label: { sv: 'Ljud från element', en: 'Noise from radiators' },
        priority: 'low',
        triage: [],
      },
    ],
  },
  {
    key: 'ventilation',
    label: { sv: 'Ventilation', en: 'Ventilation' },
    hint: { sv: 'Dålig luft, fläkt eller imma', en: 'Poor air, fans or condensation' },
    locationKinds: ['residence', 'common_area'],
    subcategories: [
      {
        key: 'poor_airflow',
        label: { sv: 'Dålig ventilation', en: 'Poor airflow' },
        priority: 'normal',
        triage: [
          {
            id: 'moisture',
            label: { sv: 'Ser du fukt, imma eller mögel?', en: 'Do you see damp, condensation or mould?' },
            type: 'single_choice',
            required: true,
            options: YES_NO(false),
          },
        ],
      },
      {
        key: 'fan_noise',
        label: { sv: 'Ljud från fläkt', en: 'Fan noise' },
        priority: 'low',
        triage: [],
      },
    ],
  },
  {
    key: 'appliances',
    label: { sv: 'Vitvaror', en: 'Appliances' },
    hint: { sv: 'Kyl, frys, spis, ugn, disk- eller tvättmaskin', en: 'Fridge, freezer, hob, oven, dishwasher or washer' },
    locationKinds: ['residence'],
    subcategories: [
      {
        key: 'fridge_freezer',
        label: { sv: 'Kyl eller frys', en: 'Fridge or freezer' },
        priority: 'high',
        triage: [
          {
            id: 'not_cooling',
            label: { sv: 'Håller den inte kylan?', en: 'Has it stopped cooling?' },
            type: 'single_choice',
            required: true,
            options: YES_NO(false),
          },
          {
            id: 'leaking',
            label: { sv: 'Läcker det vatten?', en: 'Is it leaking water?' },
            type: 'single_choice',
            required: true,
            options: YES_NO(true),
          },
        ],
      },
      {
        key: 'stove_oven',
        label: { sv: 'Spis eller ugn', en: 'Hob or oven' },
        priority: 'normal',
        triage: [
          {
            id: 'burning_smell',
            label: { sv: 'Luktar det bränt eller ryker det?', en: 'Is there a burning smell or smoke?' },
            type: 'single_choice',
            required: true,
            options: YES_NO(true),
          },
        ],
      },
      {
        key: 'dishwasher_washer',
        label: { sv: 'Disk- eller tvättmaskin', en: 'Dishwasher or washing machine' },
        priority: 'normal',
        triage: [
          {
            id: 'leaking',
            label: { sv: 'Läcker maskinen?', en: 'Is the machine leaking?' },
            type: 'single_choice',
            required: true,
            options: YES_NO(true),
          },
        ],
      },
    ],
  },
  {
    key: 'doors_locks',
    label: { sv: 'Dörrar och lås', en: 'Doors and locks' },
    hint: { sv: 'Lås, nycklar, portar och dörrstängare', en: 'Locks, keys, entrance doors and closers' },
    locationKinds: ['residence', 'common_area'],
    subcategories: [
      {
        key: 'lock_broken',
        label: { sv: 'Låset fungerar inte', en: 'The lock does not work' },
        priority: 'emergency',
        emergencyGuidance: {
          sv: 'Om du är utelåst eller om bostaden inte går att låsa – ring fastighetsjouren, ärendet hanteras inte i vanlig kö.',
          en: 'If you are locked out or cannot lock your home, call the emergency line — this is not handled in the standard queue.',
        },
        triage: [
          {
            id: 'cannot_lock',
            label: { sv: 'Går bostaden att låsa?', en: 'Can your home be locked?' },
            type: 'single_choice',
            required: true,
            options: [
              { value: 'yes', label: { sv: 'Ja', en: 'Yes' } },
              { value: 'no', label: { sv: 'Nej', en: 'No' }, escalates: true },
            ],
          },
        ],
      },
      {
        key: 'entrance_door',
        label: { sv: 'Port eller entrédörr', en: 'Entrance door' },
        priority: 'high',
        triage: [
          {
            id: 'stays_open',
            label: { sv: 'Står porten öppen?', en: 'Is the entrance door stuck open?' },
            type: 'single_choice',
            required: true,
            options: YES_NO(true),
          },
        ],
      },
    ],
  },
  {
    key: 'bathroom',
    label: { sv: 'Badrum', en: 'Bathroom' },
    hint: { sv: 'Dusch, toalett, handfat och tätskikt', en: 'Shower, toilet, sink and sealing' },
    locationKinds: ['residence'],
    subcategories: [
      { key: 'toilet', label: { sv: 'Toalett', en: 'Toilet' }, priority: 'high', triage: [
        {
          id: 'running_water',
          label: { sv: 'Rinner toaletten hela tiden?', en: 'Is the toilet running continuously?' },
          type: 'single_choice',
          required: true,
          options: YES_NO(false),
        },
      ] },
      { key: 'shower', label: { sv: 'Dusch eller badkar', en: 'Shower or bath' }, priority: 'normal', triage: [] },
      { key: 'sealing', label: { sv: 'Fukt eller tätskikt', en: 'Damp or sealing' }, priority: 'high', triage: [damageRiskQuestion] },
    ],
  },
  {
    key: 'kitchen',
    label: { sv: 'Kök', en: 'Kitchen' },
    hint: { sv: 'Skåp, bänkskiva, blandare och fläkt', en: 'Cabinets, worktop, mixer tap and hood' },
    locationKinds: ['residence'],
    subcategories: [
      { key: 'cabinets', label: { sv: 'Skåp och luckor', en: 'Cabinets and doors' }, priority: 'low', triage: [] },
      { key: 'tap', label: { sv: 'Blandare', en: 'Mixer tap' }, priority: 'normal', triage: [
        ongoingQuestion('Droppar eller läcker den nu?', 'Is it dripping or leaking right now?'),
      ] },
      { key: 'hood', label: { sv: 'Köksfläkt', en: 'Extractor hood' }, priority: 'low', triage: [] },
    ],
  },
  {
    key: 'pests',
    label: { sv: 'Skadedjur', en: 'Pests' },
    hint: { sv: 'Insekter, gnagare eller ohyra', en: 'Insects, rodents or vermin' },
    locationKinds: ['residence', 'common_area'],
    subcategories: [
      {
        key: 'sighting',
        label: { sv: 'Observation av skadedjur', en: 'Pest sighting' },
        priority: 'high',
        triage: [
          {
            id: 'kind',
            label: { sv: 'Vad har du sett?', en: 'What have you seen?' },
            type: 'single_choice',
            required: true,
            options: [
              { value: 'bedbugs', label: { sv: 'Vägglöss', en: 'Bedbugs' }, escalates: true },
              { value: 'cockroach', label: { sv: 'Kackerlackor', en: 'Cockroaches' }, escalates: true },
              { value: 'rodent', label: { sv: 'Möss eller råttor', en: 'Mice or rats' } },
              { value: 'silverfish', label: { sv: 'Silverfiskar', en: 'Silverfish' } },
              { value: 'other', label: { sv: 'Annat', en: 'Other' } },
            ],
          },
          {
            id: 'frequency',
            label: { sv: 'Hur ofta ser du dem?', en: 'How often do you see them?' },
            type: 'single_choice',
            required: false,
            options: [
              { value: 'once', label: { sv: 'En enstaka gång', en: 'Once' } },
              { value: 'weekly', label: { sv: 'Varje vecka', en: 'Weekly' } },
              { value: 'daily', label: { sv: 'Varje dag', en: 'Daily' } },
            ],
          },
        ],
      },
    ],
  },
  {
    key: 'elevator',
    label: { sv: 'Hiss', en: 'Elevator' },
    hint: { sv: 'Stannad hiss, ljud eller dörrar', en: 'Stopped elevator, noise or doors' },
    locationKinds: ['common_area'],
    subcategories: [
      {
        key: 'stopped',
        label: { sv: 'Hissen står stilla', en: 'The elevator has stopped' },
        priority: 'emergency',
        emergencyGuidance: {
          sv: 'Om någon sitter fast i hissen – använd larmknappen i hissen och ring 112 vid fara. Anmäl inte via appen först.',
          en: 'If someone is trapped in the elevator, use the alarm button inside it and call 112 if there is danger. Do not report through the app first.',
        },
        triage: [
          {
            id: 'person_trapped',
            label: { sv: 'Sitter någon fast i hissen?', en: 'Is anyone trapped inside?' },
            type: 'single_choice',
            required: true,
            options: YES_NO(true),
          },
        ],
      },
      { key: 'doors', label: { sv: 'Hissdörrar', en: 'Elevator doors' }, priority: 'high', triage: [] },
    ],
  },
  {
    key: 'laundry',
    label: { sv: 'Tvättstuga', en: 'Laundry room' },
    hint: { sv: 'Maskiner, torkrum och bokning', en: 'Machines, drying rooms and bookings' },
    locationKinds: ['common_area'],
    subcategories: [
      {
        key: 'machine',
        label: { sv: 'Trasig maskin', en: 'Broken machine' },
        priority: 'normal',
        triage: [
          {
            id: 'machine_id',
            label: { sv: 'Vilken maskin? (nummer eller placering)', en: 'Which machine? (number or position)' },
            type: 'text',
            required: false,
          },
        ],
      },
      { key: 'drying', label: { sv: 'Torkrum eller torktumlare', en: 'Drying room or tumble dryer' }, priority: 'normal', triage: [] },
    ],
  },
  {
    key: 'common_areas',
    label: { sv: 'Gemensamma utrymmen', en: 'Common areas' },
    hint: { sv: 'Trapphus, källare, cykelrum och miljörum', en: 'Stairwells, basements, bike rooms and waste rooms' },
    locationKinds: ['common_area'],
    subcategories: [
      { key: 'cleaning', label: { sv: 'Städning', en: 'Cleaning' }, priority: 'low', triage: [] },
      { key: 'lighting', label: { sv: 'Belysning', en: 'Lighting' }, priority: 'normal', triage: [] },
      { key: 'waste_room', label: { sv: 'Miljörum eller sopnedkast', en: 'Waste room or chute' }, priority: 'normal', triage: [] },
      { key: 'vandalism', label: { sv: 'Skadegörelse', en: 'Vandalism' }, priority: 'high', triage: [
        {
          id: 'ongoing',
          label: { sv: 'Pågår skadegörelsen just nu?', en: 'Is the vandalism happening right now?' },
          type: 'single_choice',
          required: true,
          options: YES_NO(true),
        },
      ] },
    ],
  },
  {
    key: 'outdoor',
    label: { sv: 'Utemiljö', en: 'Outdoor areas' },
    hint: { sv: 'Gård, lekplats, snöröjning och parkering', en: 'Yards, playgrounds, snow clearing and parking' },
    locationKinds: ['common_area', 'contract_object'],
    subcategories: [
      { key: 'playground', label: { sv: 'Lekplats', en: 'Playground' }, priority: 'high', triage: [damageRiskQuestion] },
      { key: 'snow_ice', label: { sv: 'Snö eller halka', en: 'Snow or ice' }, priority: 'high', triage: [] },
      { key: 'greenery', label: { sv: 'Grönyta eller träd', en: 'Green areas or trees' }, priority: 'low', triage: [] },
      { key: 'parking', label: { sv: 'Parkering eller garage', en: 'Parking or garage' }, priority: 'normal', triage: [] },
    ],
  },
  {
    key: 'disturbance',
    label: { sv: 'Störning', en: 'Disturbance' },
    hint: { sv: 'Ljud, rök eller otrygghet i huset', en: 'Noise, smoke or feeling unsafe in the building' },
    locationKinds: ['residence', 'common_area'],
    sensitive: true,
    subcategories: [
      {
        key: 'noise',
        label: { sv: 'Ljud och oväsen', en: 'Noise' },
        priority: 'high',
        emergencyGuidance: {
          sv: 'Vid pågående störning nattetid, kontakta störningsjouren. Vid hot, våld eller brott – ring 112. Vid brand eller brandlukt – ring 112.',
          en: 'For an ongoing disturbance at night, contact the out-of-hours disturbance service. If there is threat, violence or crime, call 112. In case of fire or a burning smell, call 112.',
        },
        triage: [
          {
            id: 'ongoing',
            label: { sv: 'Pågår störningen just nu?', en: 'Is the disturbance happening right now?' },
            type: 'single_choice',
            required: true,
            options: YES_NO(true),
          },
          {
            id: 'feels_urgent',
            label: { sv: 'Känns situationen akut eller otrygg?', en: 'Does the situation feel urgent or unsafe?' },
            type: 'single_choice',
            required: true,
            options: YES_NO(true),
          },
          {
            id: 'occurred_at',
            label: { sv: 'När inträffade störningen?', en: 'When did the disturbance occur?' },
            type: 'text',
            required: true,
          },
          {
            id: 'where',
            label: { sv: 'Var kommer störningen ifrån?', en: 'Where is the disturbance coming from?' },
            type: 'text',
            required: true,
          },
        ],
      },
      {
        key: 'smoke',
        label: { sv: 'Rök eller lukt', en: 'Smoke or odour' },
        priority: 'high',
        emergencyGuidance: {
          sv: 'Vid brandrök eller brandlukt – lämna byggnaden och ring 112.',
          en: 'If you smell or see smoke from a fire, leave the building and call 112.',
        },
        triage: [
          {
            id: 'fire_suspected',
            label: { sv: 'Misstänker du brand?', en: 'Do you suspect a fire?' },
            type: 'single_choice',
            required: true,
            options: YES_NO(true),
          },
        ],
      },
      {
        key: 'safety',
        label: { sv: 'Otrygghet', en: 'Feeling unsafe' },
        priority: 'high',
        emergencyGuidance: {
          sv: 'Vid pågående brott eller fara – ring 112. Polisens icke-akuta nummer är 114 14.',
          en: 'If a crime is in progress or there is danger, call 112. The police non-emergency number is 114 14.',
        },
        triage: [
          {
            id: 'ongoing',
            label: { sv: 'Pågår situationen just nu?', en: 'Is the situation ongoing?' },
            type: 'single_choice',
            required: true,
            options: YES_NO(true),
          },
        ],
      },
    ],
  },
  {
    key: 'other',
    label: { sv: 'Annat', en: 'Other' },
    hint: { sv: 'Något som inte passar i övriga kategorier', en: 'Anything that does not fit the other categories' },
    locationKinds: ['residence', 'common_area', 'contract_object'],
    subcategories: [
      { key: 'other', label: { sv: 'Annat', en: 'Other' }, priority: 'normal', triage: [] },
    ],
  },
];

/** Utrymmen i bostaden (krav B.1.30 – utrymme i bostad). */
export const RESIDENCE_SPACES = [
  { key: 'hall', label: { sv: 'Hall', en: 'Hallway' } },
  { key: 'kitchen', label: { sv: 'Kök', en: 'Kitchen' } },
  { key: 'living_room', label: { sv: 'Vardagsrum', en: 'Living room' } },
  { key: 'bedroom', label: { sv: 'Sovrum', en: 'Bedroom' } },
  { key: 'bathroom', label: { sv: 'Badrum', en: 'Bathroom' } },
  { key: 'wc', label: { sv: 'Separat toalett', en: 'Separate toilet' } },
  { key: 'balcony', label: { sv: 'Balkong eller uteplats', en: 'Balcony or patio' } },
  { key: 'storage', label: { sv: 'Förråd', en: 'Storage' } },
  { key: 'whole_home', label: { sv: 'Hela bostaden', en: 'The whole home' } },
] as const;

export const COMMON_AREA_SPACES = [
  { key: 'stairwell', label: { sv: 'Trapphus', en: 'Stairwell' } },
  { key: 'entrance', label: { sv: 'Entré och port', en: 'Entrance' } },
  { key: 'laundry', label: { sv: 'Tvättstuga', en: 'Laundry room' } },
  { key: 'basement', label: { sv: 'Källare', en: 'Basement' } },
  { key: 'attic', label: { sv: 'Vind', en: 'Attic' } },
  { key: 'bike_room', label: { sv: 'Cykelrum', en: 'Bike room' } },
  { key: 'waste_room', label: { sv: 'Miljörum', en: 'Waste room' } },
  { key: 'garage', label: { sv: 'Garage', en: 'Garage' } },
  { key: 'courtyard', label: { sv: 'Gård', en: 'Courtyard' } },
  { key: 'elevator', label: { sv: 'Hiss', en: 'Elevator' } },
  { key: 'common_room', label: { sv: 'Gemensamhetslokal', en: 'Common room' } },
] as const;

export function findCategory(key: string): CaseCategory | undefined {
  return CASE_CATEGORIES.find((c) => c.key === key);
}

export function findSubcategory(
  categoryKey: string,
  subcategoryKey: string,
): { category: CaseCategory; subcategory: CaseSubcategory } | undefined {
  const category = findCategory(categoryKey);
  const subcategory = category?.subcategories.find((s) => s.key === subcategoryKey);
  if (!category || !subcategory) return undefined;
  return { category, subcategory };
}

/**
 * Härleder prioritet från kategori och triagesvar.
 *
 * Ett svar som är markerat som eskalerande höjer ärendet till akut. Detta är en
 * deterministisk regel – ingen språkmodell är inblandad i prioriteringen.
 */
export function derivePriority(
  categoryKey: string,
  subcategoryKey: string,
  answers: Record<string, string>,
): { priority: CasePriority; escalated: boolean; reasons: string[] } {
  const found = findSubcategory(categoryKey, subcategoryKey);
  if (!found) return { priority: 'normal', escalated: false, reasons: [] };

  const reasons: string[] = [];
  for (const question of found.subcategory.triage) {
    const answer = answers[question.id];
    if (!answer) continue;
    const option = question.options?.find((o) => o.value === answer);
    if (option?.escalates) reasons.push(question.id);
  }

  const escalated = reasons.length > 0;
  const base = found.subcategory.priority;
  if (escalated) return { priority: 'emergency', escalated: true, reasons };
  // En akutkategori utan eskalerande svar hanteras som hög, inte som akut.
  if (base === 'emergency') return { priority: 'high', escalated: false, reasons };
  return { priority: base, escalated: false, reasons };
}

/** Läsbart namn för ett utrymme. Nyckeln visas aldrig i gränssnittet. */
export function spaceLabel(key: string | null | undefined, locale: 'sv' | 'en' = 'sv'): string | null {
  if (!key) return null;
  const found = [...RESIDENCE_SPACES, ...COMMON_AREA_SPACES].find((item) => item.key === key);
  return found ? found.label[locale] : key;
}

/** Läsbart namn för en kategori respektive underkategori. */
export function categoryLabel(key: string, locale: 'sv' | 'en' = 'sv'): string {
  return findCategory(key)?.label[locale] ?? key;
}

export function subcategoryLabel(
  categoryKey: string,
  subcategoryKey: string,
  locale: 'sv' | 'en' = 'sv',
): string {
  return findSubcategory(categoryKey, subcategoryKey)?.subcategory.label[locale] ?? subcategoryKey;
}

/** Följdfrågorna med läsbara etiketter och svarstexter, för visning i personalvyn. */
export function triageSummary(
  categoryKey: string,
  subcategoryKey: string,
  answers: Record<string, string>,
  locale: 'sv' | 'en' = 'sv',
): { label: string; value: string; escalating: boolean }[] {
  const found = findSubcategory(categoryKey, subcategoryKey);
  if (!found) return [];
  const out: { label: string; value: string; escalating: boolean }[] = [];
  for (const question of found.subcategory.triage) {
    const answer = answers[question.id];
    if (answer === undefined) continue;
    const option = question.options?.find((item) => item.value === answer);
    out.push({
      label: question.label[locale],
      value: option ? option.label[locale] : answer,
      escalating: Boolean(option?.escalates),
    });
  }
  return out;
}
