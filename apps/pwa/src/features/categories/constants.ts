import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import BakeryDiningIcon from '@mui/icons-material/BakeryDining';
import BeachAccessIcon from '@mui/icons-material/BeachAccess';
import BookIcon from '@mui/icons-material/Book';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import CategoryIcon from '@mui/icons-material/Category';
import CelebrationIcon from '@mui/icons-material/Celebration';
import ChildCareIcon from '@mui/icons-material/ChildCare';
import CodeIcon from '@mui/icons-material/Code';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import CurrencyExchangeIcon from '@mui/icons-material/CurrencyExchange';
import DescriptionIcon from '@mui/icons-material/Description';
import DirectionsBikeIcon from '@mui/icons-material/DirectionsBike';
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import DirectionsSubwayIcon from '@mui/icons-material/DirectionsSubway';
import EngineeringIcon from '@mui/icons-material/Engineering';
import FastfoodIcon from '@mui/icons-material/Fastfood';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import FlightIcon from '@mui/icons-material/Flight';
import HailIcon from '@mui/icons-material/Hail';
import HealingIcon from '@mui/icons-material/Healing';
import HikingIcon from '@mui/icons-material/Hiking';
import HomeIcon from '@mui/icons-material/Home';
import HotelIcon from '@mui/icons-material/Hotel';
import HouseIcon from '@mui/icons-material/House';
import IcecreamIcon from '@mui/icons-material/Icecream';
import LaptopMacIcon from '@mui/icons-material/LaptopMac';
import LocalBarIcon from '@mui/icons-material/LocalBar';
import LocalCafeIcon from '@mui/icons-material/LocalCafe';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import LocalPharmacyIcon from '@mui/icons-material/LocalPharmacy';
import LocalPizzaIcon from '@mui/icons-material/LocalPizza';
import LuggageIcon from '@mui/icons-material/Luggage';
import LunchDiningIcon from '@mui/icons-material/LunchDining';
import MapIcon from '@mui/icons-material/Map';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import MedicationIcon from '@mui/icons-material/Medication';
import MovieIcon from '@mui/icons-material/Movie';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import PaidIcon from '@mui/icons-material/Paid';
import PaymentsIcon from '@mui/icons-material/Payments';
import PetsIcon from '@mui/icons-material/Pets';
import PodcastsIcon from '@mui/icons-material/Podcasts';
import PriceCheckIcon from '@mui/icons-material/PriceCheck';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import SavingsIcon from '@mui/icons-material/Savings';
import SchoolIcon from '@mui/icons-material/School';
import SelfImprovementIcon from '@mui/icons-material/SelfImprovement';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import SubscriptionsIcon from '@mui/icons-material/Subscriptions';
import TerminalIcon from '@mui/icons-material/Terminal';
import TheatersIcon from '@mui/icons-material/Theaters';
import TrainIcon from '@mui/icons-material/Train';
import TramIcon from '@mui/icons-material/Tram';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TvIcon from '@mui/icons-material/Tv';
import TwoWheelerIcon from '@mui/icons-material/TwoWheeler';
import WorkIcon from '@mui/icons-material/Work';
import type { ElementType } from 'react';

export const DEFAULT_CATEGORY_COLOR = '#2E7D32';

export interface CategoryIconOption {
  name: string;
  label: string;
  group:
    | 'bills/finance'
    | 'transport'
    | 'food'
    | 'shopping'
    | 'subscriptions'
    | 'health'
    | 'work'
    | 'entertainment'
    | 'family/pets'
    | 'travel';
  keywords?: string[];
}

export const CATEGORY_ICON_OPTIONS: readonly CategoryIconOption[] = [
  { name: 'payments', label: 'Payments', group: 'bills/finance', keywords: ['bill', 'utility'] },
  { name: 'account_balance', label: 'Bank', group: 'bills/finance', keywords: ['bank', 'account'] },
  {
    name: 'account_balance_wallet',
    label: 'Wallet',
    group: 'bills/finance',
    keywords: ['wallet', 'cash'],
  },
  { name: 'attach_money', label: 'Cash', group: 'bills/finance', keywords: ['money'] },
  { name: 'savings', label: 'Savings', group: 'bills/finance', keywords: ['pot', 'saving'] },
  { name: 'paid', label: 'Paid', group: 'bills/finance', keywords: ['paid', 'salary'] },
  {
    name: 'price_check',
    label: 'Price check',
    group: 'bills/finance',
    keywords: ['price', 'receipt'],
  },
  {
    name: 'currency_exchange',
    label: 'Exchange',
    group: 'bills/finance',
    keywords: ['fx', 'exchange'],
  },
  { name: 'credit_card', label: 'Card', group: 'bills/finance', keywords: ['card', 'payment'] },
  { name: 'receipt_long', label: 'Receipt', group: 'bills/finance', keywords: ['invoice', 'bill'] },
  {
    name: 'trending_up',
    label: 'Investing up',
    group: 'bills/finance',
    keywords: ['invest', 'growth'],
  },
  {
    name: 'trending_down',
    label: 'Investing down',
    group: 'bills/finance',
    keywords: ['loss', 'drop'],
  },

  { name: 'directions_car', label: 'Car', group: 'transport', keywords: ['car', 'drive'] },
  { name: 'directions_bus', label: 'Bus', group: 'transport', keywords: ['bus', 'commute'] },
  { name: 'directions_subway', label: 'Subway', group: 'transport', keywords: ['tube', 'metro'] },
  { name: 'train', label: 'Train', group: 'transport', keywords: ['rail'] },
  { name: 'tram', label: 'Tram', group: 'transport', keywords: ['tram'] },
  { name: 'flight', label: 'Flight', group: 'transport', keywords: ['plane', 'air'] },
  { name: 'hail', label: 'Taxi', group: 'transport', keywords: ['cab', 'uber'] },
  { name: 'directions_bike', label: 'Bike', group: 'transport', keywords: ['cycle'] },
  {
    name: 'two_wheeler',
    label: 'Scooter/Motorbike',
    group: 'transport',
    keywords: ['motorbike', 'scooter'],
  },

  { name: 'restaurant', label: 'Restaurant', group: 'food', keywords: ['dining', 'meal'] },
  { name: 'local_cafe', label: 'Coffee', group: 'food', keywords: ['cafe', 'coffee'] },
  { name: 'fastfood', label: 'Fast food', group: 'food', keywords: ['takeaway'] },
  { name: 'local_pizza', label: 'Pizza', group: 'food', keywords: ['pizza'] },
  { name: 'lunch_dining', label: 'Lunch', group: 'food', keywords: ['lunch'] },
  { name: 'bakery_dining', label: 'Bakery', group: 'food', keywords: ['bread', 'pastry'] },
  { name: 'icecream', label: 'Dessert', group: 'food', keywords: ['ice cream', 'dessert'] },
  { name: 'local_bar', label: 'Bar', group: 'food', keywords: ['drinks', 'alcohol'] },

  {
    name: 'subscriptions',
    label: 'Subscription',
    group: 'subscriptions',
    keywords: ['monthly', 'renewal'],
  },
  { name: 'tv', label: 'TV', group: 'subscriptions', keywords: ['streaming'] },
  { name: 'podcasts', label: 'Podcasts', group: 'subscriptions', keywords: ['audio'] },
  { name: 'book', label: 'Books', group: 'subscriptions', keywords: ['reading', 'kindle'] },
  { name: 'music_note', label: 'Music', group: 'subscriptions', keywords: ['spotify'] },

  { name: 'medical_services', label: 'Medical', group: 'health', keywords: ['doctor', 'gp'] },
  { name: 'local_hospital', label: 'Hospital', group: 'health', keywords: ['clinic'] },
  { name: 'medication', label: 'Medication', group: 'health', keywords: ['medicine'] },
  { name: 'local_pharmacy', label: 'Pharmacy', group: 'health', keywords: ['prescription'] },
  { name: 'fitness_center', label: 'Fitness', group: 'health', keywords: ['gym'] },
  { name: 'healing', label: 'Therapy', group: 'health', keywords: ['care'] },
  { name: 'self_improvement', label: 'Wellness', group: 'health', keywords: ['mindfulness'] },

  { name: 'work', label: 'Work', group: 'work', keywords: ['job'] },
  { name: 'business_center', label: 'Business', group: 'work', keywords: ['office'] },
  { name: 'laptop_mac', label: 'Laptop', group: 'work', keywords: ['computer'] },
  { name: 'code', label: 'Code', group: 'work', keywords: ['dev', 'programming'] },
  { name: 'terminal', label: 'Terminal', group: 'work', keywords: ['cli'] },
  { name: 'engineering', label: 'Engineering', group: 'work', keywords: ['build'] },
  { name: 'school', label: 'Learning', group: 'work', keywords: ['course', 'study'] },
  { name: 'description', label: 'Documents', group: 'work', keywords: ['docs', 'paperwork'] },

  { name: 'movie', label: 'Movies', group: 'entertainment', keywords: ['cinema'] },
  { name: 'theaters', label: 'Theatre', group: 'entertainment', keywords: ['show'] },
  { name: 'sports_esports', label: 'Gaming', group: 'entertainment', keywords: ['games'] },
  { name: 'sports_soccer', label: 'Sports', group: 'entertainment', keywords: ['football'] },
  { name: 'celebration', label: 'Events', group: 'entertainment', keywords: ['party'] },

  { name: 'home', label: 'Home', group: 'family/pets', keywords: ['household'] },
  { name: 'house', label: 'House', group: 'family/pets', keywords: ['mortgage'] },
  { name: 'pets', label: 'Pets', group: 'family/pets', keywords: ['pet'] },
  { name: 'child_care', label: 'Child care', group: 'family/pets', keywords: ['kids', 'family'] },
  { name: 'favorite', label: 'Family', group: 'family/pets', keywords: ['love'] },

  { name: 'luggage', label: 'Luggage', group: 'travel', keywords: ['travel', 'trip'] },
  { name: 'hotel', label: 'Hotel', group: 'travel', keywords: ['stay'] },
  { name: 'beach_access', label: 'Beach', group: 'travel', keywords: ['holiday'] },
  { name: 'map', label: 'Map', group: 'travel', keywords: ['route'] },
  { name: 'hiking', label: 'Outdoor', group: 'travel', keywords: ['nature'] },
  { name: 'camera_alt', label: 'Photography', group: 'travel', keywords: ['camera'] },

  { name: 'shopping_bag', label: 'Shopping bag', group: 'shopping', keywords: ['shopping'] },
  { name: 'shopping_cart', label: 'Shopping cart', group: 'shopping', keywords: ['groceries'] },
  { name: 'category', label: 'Generic category', group: 'bills/finance', keywords: ['default'] },
] as const;

export const CATEGORY_COLOR_OPTIONS = [
  '#2E7D32',
  '#1976D2',
  '#00838F',
  '#6A1B9A',
  '#AD1457',
  '#D81B60',
  '#E64A19',
  '#F57C00',
  '#F9A825',
  '#7CB342',
  '#43A047',
  '#1565C0',
  '#5E35B1',
  '#37474F',
  '#546E7A',
  '#455A64',
] as const;

export const CATEGORY_ICON_COMPONENTS: Record<string, ElementType> = {
  payments: PaymentsIcon,
  account_balance: AccountBalanceIcon,
  account_balance_wallet: AccountBalanceWalletIcon,
  attach_money: AttachMoneyIcon,
  savings: SavingsIcon,
  paid: PaidIcon,
  price_check: PriceCheckIcon,
  currency_exchange: CurrencyExchangeIcon,
  credit_card: CreditCardIcon,
  receipt_long: ReceiptLongIcon,
  trending_up: TrendingUpIcon,
  trending_down: TrendingDownIcon,

  directions_car: DirectionsCarIcon,
  directions_bus: DirectionsBusIcon,
  directions_subway: DirectionsSubwayIcon,
  train: TrainIcon,
  tram: TramIcon,
  flight: FlightIcon,
  hail: HailIcon,
  directions_bike: DirectionsBikeIcon,
  two_wheeler: TwoWheelerIcon,

  restaurant: RestaurantIcon,
  local_cafe: LocalCafeIcon,
  fastfood: FastfoodIcon,
  local_pizza: LocalPizzaIcon,
  lunch_dining: LunchDiningIcon,
  bakery_dining: BakeryDiningIcon,
  icecream: IcecreamIcon,
  local_bar: LocalBarIcon,

  subscriptions: SubscriptionsIcon,
  tv: TvIcon,
  podcasts: PodcastsIcon,
  book: BookIcon,
  music_note: MusicNoteIcon,

  medical_services: MedicalServicesIcon,
  local_hospital: LocalHospitalIcon,
  medication: MedicationIcon,
  local_pharmacy: LocalPharmacyIcon,
  fitness_center: FitnessCenterIcon,
  healing: HealingIcon,
  self_improvement: SelfImprovementIcon,

  work: WorkIcon,
  business_center: BusinessCenterIcon,
  laptop_mac: LaptopMacIcon,
  code: CodeIcon,
  terminal: TerminalIcon,
  engineering: EngineeringIcon,
  school: SchoolIcon,
  description: DescriptionIcon,

  movie: MovieIcon,
  theaters: TheatersIcon,
  sports_esports: SportsEsportsIcon,
  sports_soccer: SportsSoccerIcon,
  celebration: CelebrationIcon,

  home: HomeIcon,
  house: HouseIcon,
  pets: PetsIcon,
  child_care: ChildCareIcon,
  favorite: FavoriteIcon,

  luggage: LuggageIcon,
  hotel: HotelIcon,
  beach_access: BeachAccessIcon,
  map: MapIcon,
  hiking: HikingIcon,
  camera_alt: CameraAltIcon,

  shopping_bag: ShoppingBagIcon,
  shopping_cart: ShoppingCartIcon,
  category: CategoryIcon,
};
