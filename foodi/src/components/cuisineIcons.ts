import { Beef, Coffee, CookingPot, Fish, Flame, LayoutGrid, Leaf, Pizza, Salad, Sandwich, Soup, type LucideIcon } from 'lucide-react';
import type { CuisineId } from '../types';

export const CUISINE_ICONS: Record<'alla' | CuisineId, LucideIcon> = {
  alla: LayoutGrid,
  burgare: Beef,
  pizza: Pizza,
  sushi: Fish,
  asiatiskt: Soup,
  husman: CookingPot,
  fika: Coffee,
  vegetariskt: Leaf,
  mellanostern: Sandwich,
  mexikanskt: Flame,
  sallad: Salad,
};
