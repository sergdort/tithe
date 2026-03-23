import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import RepeatOutlinedIcon from '@mui/icons-material/RepeatOutlined';
import {
  AppBar,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  IconButton,
  Paper,
  Toolbar,
  Typography,
} from '@mui/material';
import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface MobileShellProps {
  title: string;
  activeTab?: string;
  showBackButton?: boolean;
  onBack?: () => void;
  children: React.ReactNode;
}

const tabs = [
  { label: 'Home', path: '/', icon: <HomeOutlinedIcon /> },
  { label: 'Transactions', path: '/transactions', icon: <ReceiptLongOutlinedIcon /> },
  { label: 'Commitments', path: '/commitments', icon: <RepeatOutlinedIcon /> },
  { label: 'Categories', path: '/categories', icon: <ListAltOutlinedIcon /> },
  { label: 'Insights', path: '/insights', icon: <InsightsOutlinedIcon /> },
];

export const MobileShell = ({
  title,
  activeTab,
  showBackButton = false,
  onBack,
  children,
}: MobileShellProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  const defaultActive = useMemo(
    () =>
      tabs.find((item) => {
        if (item.path === '/') {
          return location.pathname === '/';
        }
        return location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
      })?.path ?? '/',
    [location.pathname],
  );
  const selectedTab = activeTab ?? defaultActive;

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default' }}>
      <AppBar
        elevation={0}
        position="sticky"
        color="inherit"
        sx={{
          pt: 'env(safe-area-inset-top, 0px)',
          bgcolor: 'background.paper',
          borderBottom: '1px solid #DCE8E0',
          zIndex: (theme) => theme.zIndex.appBar,
        }}
      >
        <Toolbar sx={{ minHeight: 56 }}>
          {showBackButton ? (
            <IconButton edge="start" aria-label="Back" onClick={onBack} sx={{ mr: 1 }}>
              <ArrowBackIosNewIcon fontSize="small" />
            </IconButton>
          ) : null}
          <Typography component="h1" variant="h6" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
        </Toolbar>
      </AppBar>

      <Box
        component="main"
        sx={{
          px: 2,
          pb: 'calc(88px + env(safe-area-inset-bottom, 0px))',
          pt: 1.5,
          maxWidth: 640,
          mx: 'auto',
        }}
      >
        {children}
      </Box>

      <Paper
        elevation={3}
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: (theme) => theme.zIndex.appBar + 2,
          pb: 'env(safe-area-inset-bottom, 0px)',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          overflow: 'hidden',
        }}
      >
        <BottomNavigation value={selectedTab} onChange={(_e, value) => navigate(value)} showLabels>
          {tabs.map((item) => (
            <BottomNavigationAction
              key={item.path}
              value={item.path}
              label={item.label}
              icon={item.icon}
              sx={{ minHeight: 56 }}
            />
          ))}
        </BottomNavigation>
      </Paper>
    </Box>
  );
};
