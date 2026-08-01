import { apiRequest } from "./queryClient";

export interface User {
  id: number;
  name: string;
  email: string;
  role: "AddBox" | "Connector" | "Supporter" | "Client";
  companyName?: string;
  connectorCompanyId?: number;
}

export interface AuthResponse {
  token: string;
  user: User;
}

class AuthService {
  private tokenKey = "growth_park_token";

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  setToken(token: string): void {
    localStorage.setItem(this.tokenKey, token);
  }

  removeToken(): void {
    localStorage.removeItem(this.tokenKey);
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await apiRequest("POST", "/api/auth/login", {
      email,
      password,
    });
    
    const data = await response.json();
    this.setToken(data.token);
    return data;
  }

  async register(userData: {
    name: string;
    email: string;
    password: string;
    role: string;
    companyName?: string;
    industry?: string;
    address?: string;
  }): Promise<AuthResponse> {
    const response = await apiRequest("POST", "/api/auth/register", userData);
    
    const data = await response.json();
    this.setToken(data.token);
    return data;
  }

  async getCurrentUser(): Promise<User> {
    const token = this.getToken();
    if (!token) {
      throw new Error("No token found");
    }

    const response = await fetch("/api/auth/me", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      this.removeToken();
      throw new Error("Authentication failed");
    }

    return response.json();
  }

  logout(): void {
    this.removeToken();
    window.location.href = "/login";
  }

  isAuthenticated(): boolean {
    return this.getToken() !== null;
  }
}

export const authService = new AuthService();
