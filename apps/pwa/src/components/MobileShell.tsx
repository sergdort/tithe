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
  Paper,
  Toolbar,
  Typography,
} from '@mui/material';
import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface MobileShellProps {
  title: string;
  children: React.ReactNode;
}

const tabs = [
  { label: 'Home', path: '/', icon: <HomeOutlinedIcon /> },
  { label: 'Expenses', path: '/expenses', icon: <ReceiptLongOutlinedIcon /> },
  { label: 'Commitments', path: '/commitments', icon: <RepeatOutlinedIcon /> },
  { label: 'Categories', path: '/categories', icon: <ListAltOutlinedIcon /> },
  { label: 'Insights', path: '/insights', icon: <InsightsOutlinedIcon /> },
];

export const MobileShell = ({ title, children }: MobileShellProps) => {
  const location = useLocation();
  const navigate = useNavigate();

  const active = useMemo(
    () => tabs.find((item) => location.pathname === item.path)?.path ?? '/',
    [location.pathname],
  );

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
        <BottomNavigation value={active} onChange={(_e, value) => navigate(value)} showLabels>
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
