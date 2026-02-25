import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import CategoryIcon from '@mui/icons-material/Category';
import CelebrationIcon from '@mui/icons-material/Celebration';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FlightIcon from '@mui/icons-material/Flight';
import HomeIcon from '@mui/icons-material/Home';
import HouseIcon from '@mui/icons-material/House';
import LocalCafeIcon from '@mui/icons-material/LocalCafe';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import MovieIcon from '@mui/icons-material/Movie';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import PaymentsIcon from '@mui/icons-material/Payments';
import PetsIcon from '@mui/icons-material/Pets';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import SavingsIcon from '@mui/icons-material/Savings';
import SchoolIcon from '@mui/icons-material/School';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import TheatersIcon from '@mui/icons-material/Theaters';
import TrainIcon from '@mui/icons-material/Train';
import TvIcon from '@mui/icons-material/Tv';
import WorkIcon from '@mui/icons-material/Work';
import type { ElementType } from 'react';

export const CATEGORY_ICON_OPTIONS = [
  'savings',
  'home',
  'house',
  'payments',
  'account_balance',
  'shopping_bag',
  'shopping_cart',
  'restaurant',
  'local_cafe',
  'sports_soccer',
  'sports_esports',
  'movie',
  'theaters',
  'music_note',
  'tv',
  'directions_car',
  'train',
  'flight',
  'medical_services',
  'school',
  'work',
  'pets',
  'celebration',
  'favorite',
  'receipt_long',
  'attach_money',
  'category',
] as const;

export const CATEGORY_ICON_COMPONENTS: Record<string, ElementType> = {
  savings: SavingsIcon,
  home: HomeIcon,
  house: HouseIcon,
  payments: PaymentsIcon,
  account_balance: AccountBalanceIcon,
  shopping_bag: ShoppingBagIcon,
  shopping_cart: ShoppingCartIcon,
  restaurant: RestaurantIcon,
  local_cafe: LocalCafeIcon,
  sports_soccer: SportsSoccerIcon,
  sports_esports: SportsEsportsIcon,
  movie: MovieIcon,
  theaters: TheatersIcon,
  music_note: MusicNoteIcon,
  tv: TvIcon,
  directions_car: DirectionsCarIcon,
  train: TrainIcon,
  flight: FlightIcon,
  medical_services: MedicalServicesIcon,
  school: SchoolIcon,
  work: WorkIcon,
  pets: PetsIcon,
  celebration: CelebrationIcon,
  favorite: FavoriteIcon,
  receipt_long: ReceiptLongIcon,
  attach_money: AttachMoneyIcon,
  category: CategoryIcon,
};
