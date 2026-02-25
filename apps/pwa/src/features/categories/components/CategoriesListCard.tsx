import CategoryIcon from '@mui/icons-material/Category';
import EditIcon from '@mui/icons-material/Edit';
import LinkIcon from '@mui/icons-material/Link';
import {
  Box,
  Card,
  CardContent,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';

import type { Category, ReimbursementCategoryRule } from '../../../types.js';
import { CATEGORY_ICON_COMPONENTS } from '../constants.js';
import { isMonzoPlaceholderCategoryName, normalizeCategoryLabel } from '../utils.js';

interface CategoriesListCardProps {
  categories: Category[];
  rulesByExpenseCategoryId: Map<string, ReimbursementCategoryRule[]>;
  onOpenAutoMatchRules: (categoryId: string) => void;
  onEditCategory: (category: Category) => void;
}

export const CategoriesListCard = ({
  categories,
  rulesByExpenseCategoryId,
  onOpenAutoMatchRules,
  onEditCategory,
}: CategoriesListCardProps) => (
  <Card>
    <CardContent>
      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
        Category List
      </Typography>
      {categories.length === 0 ? (
        <Typography color="text.secondary">No categories yet.</Typography>
      ) : (
        <List disablePadding>
          {categories.map((category) => {
            const expenseRules = rulesByExpenseCategoryId.get(category.id) ?? [];
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
                    secondary={category.kind}
                  />
                  <ListItemSecondaryAction>
                    <Stack direction="row" spacing={0.5}>
                      {category.kind === 'expense' ? (
                        <IconButton
                          edge="end"
                          aria-label="auto-match rules"
                          onClick={() => onOpenAutoMatchRules(category.id)}
                        >
                          <LinkIcon fontSize="small" />
                        </IconButton>
                      ) : null}
                      <IconButton
                        edge="end"
                        aria-label="edit category"
                        onClick={() => onEditCategory(category)}
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
      )}
    </CardContent>
  </Card>
);
