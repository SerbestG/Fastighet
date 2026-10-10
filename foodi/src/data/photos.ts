// Matfoton. Restauranger som inte har laddat upp egna bilder visas med ett
// omslag i sina egna färger i stället.
import burgerHero from '../assets/photos/burger-hero.webp';
import prestoBurger from '../assets/photos/presto-burger.webp';
import crispyChicken from '../assets/photos/crispy-chicken.webp';
import kottbullar from '../assets/photos/kottbullar.webp';
import wallenbergare from '../assets/photos/wallenbergare.webp';
import biffLindstrom from '../assets/photos/biff-lindstrom.webp';
import thaiNoodles from '../assets/photos/thai-noodles.webp';
import ingSallad from '../assets/photos/ing-sallad.webp';
import ingTomat from '../assets/photos/ing-tomat.webp';
import ingLok from '../assets/photos/ing-lok.webp';
import ingCheddar from '../assets/photos/ing-cheddar.webp';
import ingBacon from '../assets/photos/ing-bacon.webp';
import ingDressing from '../assets/photos/ing-dressing.webp';
import exKott from '../assets/photos/ex-kott.webp';
import exOst from '../assets/photos/ex-ost.webp';
import exBacon from '../assets/photos/ex-bacon.webp';
import exJalapenos from '../assets/photos/ex-jalapenos.webp';
import exPommes from '../assets/photos/ex-pommes.webp';

const library: Record<string, string> = {
  'burger-hero': burgerHero,
  'presto-burger': prestoBurger,
  'crispy-chicken': crispyChicken,
  kottbullar,
  wallenbergare,
  'biff-lindstrom': biffLindstrom,
  'thai-noodles': thaiNoodles,
  'ing-sallad': ingSallad,
  'ing-tomat': ingTomat,
  'ing-lok': ingLok,
  'ing-cheddar': ingCheddar,
  'ing-bacon': ingBacon,
  'ing-dressing': ingDressing,
  'ex-kott': exKott,
  'ex-ost': exOst,
  'ex-bacon': exBacon,
  'ex-jalapenos': exJalapenos,
  'ex-pommes': exPommes,
};

/** Bildadress för en fotonyckel eller en uppladdad bild. */
export function photoSrc(key: string | undefined): string | undefined {
  if (!key) return undefined;
  if (key.startsWith('data:') || key.startsWith('blob:')) return key;
  return library[key];
}
