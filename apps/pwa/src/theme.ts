import { createTheme } from '@mui/material';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0D5A32',
      light: '#4AA06A',
      dark: '#063B21',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#D18A00',
      contrastText: '#1F1A00',
    },
    background: {
      default: '#F6FAF7',
      paper: '#FFFFFF',
    },
  },
  shape: {
    borderRadius: 14,
  },
  typography: {
    fontFamily: '"Atkinson Hyperlegible Next", "Noto Sans", sans-serif',
    fontSize: 16,
  },
  components: {
    MuiButtonBase: {
      defaultProps: {
        disableRipple: false,
      },
      styleOverrides: {
        root: {
          minHeight: 44,
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          minHeight: 52,
        },
      },
    },
  },
});
