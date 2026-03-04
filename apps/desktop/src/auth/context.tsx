import { createContext, useContext, useMemo } from "react";

export type AuthSession = {
  access_token: string;
  user: { id: string; email: string };
};

export type AuthContextType = {
  session: AuthSession | null;
  isRefreshingSession: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<null>;
  handleAuthCallback: (url: string) => Promise<void>;
  setSessionFromTokens: (
    accessToken: string,
    refreshToken: string,
  ) => Promise<void>;
  getHeaders: () => Record<string, string> | null;
  getAvatarUrl: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("'useAuth' must be used within an 'AuthProvider'");
  }

  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo(
    (): AuthContextType => ({
      session: null,
      isRefreshingSession: false,
      signIn: async () => {
        console.log("Auth is local-only, no cloud sign-in available");
      },
      signOut: async () => {},
      refreshSession: async () => null,
      handleAuthCallback: async () => {},
      setSessionFromTokens: async () => {},
      getHeaders: () => null,
      getAvatarUrl: async () => null,
    }),
    [],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
