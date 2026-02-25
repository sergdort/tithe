import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AddIcon from '@mui/icons-material/Add';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import CategoryIcon from '@mui/icons-material/Category';
import CelebrationIcon from '@mui/icons-material/Celebration';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import EditIcon from '@mui/icons-material/Edit';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FlightIcon from '@mui/icons-material/Flight';
import HomeIcon from '@mui/icons-material/Home';
import HouseIcon from '@mui/icons-material/House';
import LinkIcon from '@mui/icons-material/Link';
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
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ElementType } from 'react';
import { useMemo, useState } from 'react';

import { api } from '../api.js';
import { AutoMatchRepaymentCategoriesDialog } from '../features/categories/dialogs/AutoMatchRepaymentCategoriesDialog.js';
import {
  type CategoryEditDraft,
  EditCategoryDialog,
} from '../features/categories/dialogs/EditCategoryDialog.js';
import type { Category, ReimbursementCategoryRule } from '../types.js';

const normalizeCategoryLabel = (name: string): string =>
  name.startsWith('Monzo: ') ? name.slice('Monzo: '.length) : name;

const isMonzoPlaceholderCategoryName = (name: string): boolean =>
  /^Category [a-z0-9]+$/i.test(name.trim());

const CATEGORY_ICON_OPTIONS = [
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

const CATEGORY_ICON_COMPONENTS: Record<string, ElementType> = {
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

const buildDraftFromCategory = (category: Category): CategoryEditDraft => ({
  name: category.name,
  icon: category.icon,
  reimbursementMode: category.reimbursementMode ?? 'none',
  defaultCounterpartyType: category.defaultCounterpartyType ?? null,
  defaultRecoveryWindowDaysText:
    category.defaultRecoveryWindowDays === null || category.defaultRecoveryWindowDays === undefined
      ? ''
      : String(category.defaultRecoveryWindowDays),
});

const parseNullableNonNegativeInt = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('Default recovery window must be a non-negative integer or blank.');
  }
  return parsed;
};

export const CategoriesPage = () => {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [name, setName] = useState('');
  const [kind, setKind] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [reimbursementMode, setReimbursementMode] = useState<'none' | 'optional' | 'always'>(
    'none',
  );
  const [icon, setIcon] = useState<string>('savings');

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [draftsById, setDraftsById] = useState<Record<string, CategoryEditDraft>>({});
  const [rulesOpenCategoryId, setRulesOpenCategoryId] = useState<string | null>(null);
  const [rowErrorById, setRowErrorById] = useState<Record<string, string | null>>({});
  const [rulesErrorByExpenseCategoryId, setRulesErrorByExpenseCategoryId] = useState<
    Record<string, string | null>
  >({});

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.categories.list(),
  });

  const rulesQuery = useQuery({
    queryKey: ['reimbursement-category-rules'],
    queryFn: () => api.reimbursements.listCategoryRules(),
  });

  const createCategory = useMutation({
    mutationFn: () => api.categories.create({ name, kind, icon, reimbursementMode }),
    onSuccess: async () => {
      setName('');
      setReimbursementMode('none');
      setIcon('savings');
      await queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });

  const updateCategory = useMutation({
    mutationFn: async (input: { category: Category; draft: CategoryEditDraft }) => {
      const { category, draft } = input;
      const patch: {
        name?: string;
        icon?: string;
        reimbursementMode?: 'none' | 'optional' | 'always';
        defaultCounterpartyType?: 'self' | 'partner' | 'team' | 'other' | null;
        defaultRecoveryWindowDays?: number | null;
      } = {
        name: draft.name.trim(),
        icon: draft.icon,
      };

      if (category.kind === 'expense') {
        patch.reimbursementMode = draft.reimbursementMode;
        patch.defaultCounterpartyType = draft.defaultCounterpartyType;
        patch.defaultRecoveryWindowDays = parseNullableNonNegativeInt(
          draft.defaultRecoveryWindowDaysText,
        );
      }

      return api.categories.update(category.id, patch);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });

  const createRule = useMutation({
    mutationFn: (body: { expenseCategoryId: string; inboundCategoryId: string }) =>
      api.reimbursements.createCategoryRule(body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['reimbursement-category-rules'] });
    },
  });

  const deleteRule = useMutation({
    mutationFn: (id: string) => api.reimbursements.deleteCategoryRule(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['reimbursement-category-rules'] });
    },
  });

  const categories = categoriesQuery.data ?? [];
  const rules = rulesQuery.data ?? [];
  const editingCategory = editingCategoryId
    ? (categories.find((category) => category.id === editingCategoryId) ?? null)
    : null;
  const rulesEditingCategory = rulesOpenCategoryId
    ? (categories.find(
        (category) => category.id === rulesOpenCategoryId && category.kind === 'expense',
      ) ?? null)
    : null;

  const rulesByExpenseCategoryId = useMemo(() => {
    const map = new Map<string, ReimbursementCategoryRule[]>();
    for (const rule of rules) {
      const list = map.get(rule.expenseCategoryId) ?? [];
      list.push(rule);
      map.set(rule.expenseCategoryId, list);
    }
    return map;
  }, [rules]);

  const inboundCategories = useMemo(
    () =>
      categories.filter((category) => category.kind === 'income' || category.kind === 'transfer'),
    [categories],
  );

  const editingDraft = editingCategory
    ? (draftsById[editingCategory.id] ?? buildDraftFromCategory(editingCategory))
    : null;
  const rulesEditingLinkedInboundIds = new Set(
    (rulesEditingCategory ? (rulesByExpenseCategoryId.get(rulesEditingCategory.id) ?? []) : []).map(
      (rule) => rule.inboundCategoryId,
    ),
  );

  if (categoriesQuery.isLoading || rulesQuery.isLoading) {
    return (
      <Stack alignItems="center" sx={{ py: 6 }}>
        <CircularProgress />
      </Stack>
    );
  }

  if (categoriesQuery.isError) {
    return <Alert severity="error">Unable to load categories.</Alert>;
  }

  if (rulesQuery.isError) {
    return <Alert severity="error">Unable to load reimbursement category rules.</Alert>;
  }

  const beginEdit = (category: Category) => {
    setEditingCategoryId(category.id);
    setDraftsById((prev) => ({
      ...prev,
      [category.id]: prev[category.id] ?? buildDraftFromCategory(category),
    }));
    setRowErrorById((prev) => ({ ...prev, [category.id]: null }));
  };

  const cancelEdit = (categoryId: string) => {
    setEditingCategoryId((prev) => (prev === categoryId ? null : prev));
    setDraftsById((prev) => {
      const next = { ...prev };
      delete next[categoryId];
      return next;
    });
    setRowErrorById((prev) => ({ ...prev, [categoryId]: null }));
  };

  const setDraft = (categoryId: string, patch: Partial<CategoryEditDraft>) => {
    setDraftsById((prev) => ({
      ...prev,
      [categoryId]: {
        ...(prev[categoryId] ?? {
          name: '',
          icon: 'savings',
          reimbursementMode: 'none',
          defaultCounterpartyType: null,
          defaultRecoveryWindowDaysText: '',
        }),
        ...patch,
      },
    }));
  };

  const handleSaveCategory = async (category: Category) => {
    const draft = draftsById[category.id] ?? buildDraftFromCategory(category);
    setRowErrorById((prev) => ({ ...prev, [category.id]: null }));

    try {
      await updateCategory.mutateAsync({ category, draft });
      setEditingCategoryId((prev) => (prev === category.id ? null : prev));
    } catch (error) {
      setRowErrorById((prev) => ({
        ...prev,
        [category.id]: error instanceof Error ? error.message : 'Failed to update category.',
      }));
    }
  };

  const handleToggleRule = async (
    expenseCategoryId: string,
    inboundCategoryId: string,
    enabled: boolean,
  ) => {
    setRulesErrorByExpenseCategoryId((prev) => ({ ...prev, [expenseCategoryId]: null }));
    try {
      const existing = (rulesByExpenseCategoryId.get(expenseCategoryId) ?? []).find(
        (rule) => rule.inboundCategoryId === inboundCategoryId,
      );
      if (enabled) {
        await createRule.mutateAsync({ expenseCategoryId, inboundCategoryId });
      } else if (existing) {
        await deleteRule.mutateAsync(existing.id);
      }
    } catch (error) {
      setRulesErrorByExpenseCategoryId((prev) => ({
        ...prev,
        [expenseCategoryId]:
          error instanceof Error ? error.message : 'Failed to update auto-match rule.',
      }));
    }
  };

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700}>
            Add Category
          </Typography>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <TextField
              select
              label="Kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as typeof kind)}
            >
              <MenuItem value="expense">Expense</MenuItem>
              <MenuItem value="income">Income</MenuItem>
              <MenuItem value="transfer">Transfer</MenuItem>
            </TextField>
            <TextField
              select
              label="Icon"
              value={icon}
              onChange={(event) => setIcon(event.target.value)}
            >
              {CATEGORY_ICON_OPTIONS.map((iconName) => {
                const IconComponent = CATEGORY_ICON_COMPONENTS[iconName] ?? CategoryIcon;
                return (
                  <MenuItem key={iconName} value={iconName}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <IconComponent fontSize="small" />
                      <Typography variant="body2">{iconName}</Typography>
                    </Stack>
                  </MenuItem>
                );
              })}
            </TextField>
            {kind === 'expense' ? (
              <TextField
                select
                label="Reimbursement Mode"
                value={reimbursementMode}
                onChange={(event) =>
                  setReimbursementMode(event.target.value as typeof reimbursementMode)
                }
              >
                <MenuItem value="none">None</MenuItem>
                <MenuItem value="optional">Optional</MenuItem>
                <MenuItem value="always">Always</MenuItem>
              </TextField>
            ) : null}
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => createCategory.mutate()}
              disabled={createCategory.isPending || name.trim().length === 0}
            >
              Add Category
            </Button>
            {createCategory.isError ? (
              <Alert severity="error">{(createCategory.error as Error).message}</Alert>
            ) : null}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
            Category List
          </Typography>
          <List disablePadding>
            {categories.map((category) => {
              const expenseRules = rulesByExpenseCategoryId.get(category.id) ?? [];
              const linkedInboundIds = new Set(expenseRules.map((rule) => rule.inboundCategoryId));
              const isPlaceholder = isMonzoPlaceholderCategoryName(category.name);
              const CategoryRowIcon =
                CATEGORY_ICON_COMPONENTS[category.icon || 'category'] ?? CategoryIcon;

              return (
                <Box key={category.id} sx={{ mb: 1.5 }}>
                  <ListItem alignItems="flex-start" disableGutters sx={{ pr: 6 }}>
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <CategoryRowIcon fontSize="small" color="action" />
                          <Typography variant="body1">
                            {normalizeCategoryLabel(category.name)}
                          </Typography>
                          {isPlaceholder ? (
                            <Chip size="small" color="warning" label="Monzo placeholder" />
                          ) : null}
                          {category.kind === 'expense' ? (
                            <Chip
                              size="small"
                              label={`reimbursement: ${category.reimbursementMode ?? 'none'}`}
                              variant="outlined"
                            />
                          ) : null}
                          {category.kind === 'expense' ? (
                            <Chip
                              size="small"
                              label={`auto-match: ${expenseRules.length} rule${expenseRules.length === 1 ? '' : 's'}`}
                              variant="outlined"
                            />
                          ) : null}
                        </Stack>
                      }
                      secondary={`${category.kind}`}
                    />
                    <ListItemSecondaryAction>
                      <Stack direction="row" spacing={0.5}>
                        {category.kind === 'expense' ? (
                          <IconButton
                            edge="end"
                            aria-label="auto-match rules"
                            onClick={() => setRulesOpenCategoryId(category.id)}
                          >
                            <LinkIcon fontSize="small" />
                          </IconButton>
                        ) : null}
                        <IconButton
                          edge="end"
                          aria-label="edit category"
                          onClick={() => beginEdit(category)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </ListItemSecondaryAction>
                  </ListItem>
                </Box>
              );
            })}
          </List>
        </CardContent>
      </Card>

      <AutoMatchRepaymentCategoriesDialog
        open={Boolean(rulesEditingCategory)}
        expenseCategory={rulesEditingCategory}
        inboundCategories={inboundCategories}
        linkedInboundIds={rulesEditingLinkedInboundIds}
        errorMessage={
          rulesEditingCategory
            ? (rulesErrorByExpenseCategoryId[rulesEditingCategory.id] ?? null)
            : null
        }
        isBusy={createRule.isPending || deleteRule.isPending}
        isMobile={isMobile}
        onClose={() => setRulesOpenCategoryId(null)}
        onToggleRule={(inboundCategoryId, enabled) => {
          if (!rulesEditingCategory) return;
          void handleToggleRule(rulesEditingCategory.id, inboundCategoryId, enabled);
        }}
      />

      <EditCategoryDialog
        open={Boolean(editingCategory && editingDraft)}
        category={editingCategory}
        draft={editingDraft}
        iconOptions={CATEGORY_ICON_OPTIONS}
        iconComponents={CATEGORY_ICON_COMPONENTS}
        errorMessage={editingCategory ? (rowErrorById[editingCategory.id] ?? null) : null}
        isSubmitting={updateCategory.isPending}
        isMobile={isMobile}
        onClose={() => {
          if (!editingCategory) return;
          cancelEdit(editingCategory.id);
        }}
        onSave={() => {
          if (!editingCategory) return;
          void handleSaveCategory(editingCategory);
        }}
        onChangeDraft={(patch) => {
          if (!editingCategory) return;
          setDraft(editingCategory.id, patch);
        }}
      />
    </Stack>
  );
};
