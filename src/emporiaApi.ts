import axios, { AxiosInstance } from 'axios';
import type { Logging } from 'homebridge';
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';

// Polyfill for Node.js environment (Cognito expects browser globals)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof (global as any).fetch === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).fetch = async (...args: any[]) => {
    const nodeFetch = (await import('node-fetch')).default;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (nodeFetch as any)(...args);
  };
}

export interface EmporiaTokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface EmporiaDevice {
  deviceGid: number;
  manufacturerDeviceId: string;
  model: string;
  firmware: string;
  devices?: EmporiaDevice[];
  channels?: EmporiaChannel[];
  outlet?: EmporiaOutlet;
  evCharger?: EmporiaCharger;
  locationProperties?: {
    deviceName?: string;
    zipCode?: string;
    timeZone?: string;
  };
}

export interface EmporiaChannel {
  deviceGid: number;
  name: string;
  channelNum: string;
  channelMultiplier: number;
  channelTypeGid: number;
}

export interface EmporiaOutlet {
  deviceGid: number;
  outletOn: boolean;
  parentDeviceGid?: number;
  icon?: string;
  locationProperties?: {
    deviceName?: string;
  };
}

export interface EmporiaCharger {
  deviceGid: number;
  chargerOn: boolean;
  chargingRate: number;
  maxChargingRate: number;
  parentDeviceGid?: number;
}

export interface EmporiaUsageData {
  deviceListUsages: {
    instant: string;
    devices: Array<{
      deviceGid: number;
      channelUsages: Array<{
        deviceGid: number;
        channelNum: string;
        usage: number;
      }>;
    }>;
  };
}

/**
 * Emporia Energy API Client
 * Based on PyEmVue implementation
 * Uses AWS Cognito for authentication
 */
export class EmporiaApi {
  private readonly baseUrl = 'https://api.emporiaenergy.com';
  private readonly client: AxiosInstance;
  private tokens: EmporiaTokens | null = null;
  
  // AWS Cognito configuration from PyEmVue
  private readonly cognitoClientId = '4qte47jbstod8apnfic0bunmrq';
  private readonly cognitoUserPoolId = 'us-east-2_ghlOXVLi1';
  private cognitoUser: CognitoUser | null = null;
  private username: string | null = null;

  /** gid -> Emporia device name, refreshed at discovery. */
  private readonly deviceNames = new Map<number, string>();

  constructor(private readonly log: Logging) {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add response interceptor for token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          try {
            await this.refreshAccessToken();
            originalRequest.headers.authtoken = this.tokens?.idToken;
            return this.client(originalRequest);
          } catch (refreshError) {
            this.log.error('Token refresh failed:', refreshError);
            throw refreshError;
          }
        }
        return Promise.reject(error);
      },
    );
  }

  /**
   * Authenticate with username and password using AWS Cognito
   */
  async login(username: string, password: string): Promise<EmporiaTokens> {
    try {
      this.log.debug('Authenticating with Emporia API via Cognito...');
      this.username = username.toLowerCase();

      const userPool = new CognitoUserPool({
        UserPoolId: this.cognitoUserPoolId,
        ClientId: this.cognitoClientId,
      });

      this.cognitoUser = new CognitoUser({
        Username: this.username,
        Pool: userPool,
      });

      const authDetails = new AuthenticationDetails({
        Username: this.username,
        Password: password,
      });

      return new Promise((resolve, reject) => {
        this.cognitoUser!.authenticateUser(authDetails, {
          onSuccess: (session: CognitoUserSession) => {
            this.tokens = {
              idToken: session.getIdToken().getJwtToken(),
              accessToken: session.getAccessToken().getJwtToken(),
              refreshToken: session.getRefreshToken().getToken(),
              expiresAt: Date.now() + (3600 * 1000), // 1 hour
            };

            this.client.defaults.headers.common.authtoken = this.tokens.idToken;
            this.log.info('Successfully authenticated with Emporia API');
            resolve(this.tokens);
          },
          onFailure: (err) => {
            this.log.error('Cognito authentication failed:', err.message);
            reject(new Error(`Authentication failed: ${err.message}`));
          },
        });
      });
    } catch (error) {
      this.log.error('Failed to authenticate:', error);
      throw new Error('Authentication failed');
    }
  }

  /**
   * Refresh access token using Cognito
   */
  private async refreshAccessToken(): Promise<void> {
    if (!this.cognitoUser || !this.tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    return new Promise((resolve, reject) => {
      // Cognito requires CognitoRefreshToken but we only have the token string
      this.cognitoUser!.refreshSession(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { getToken: () => this.tokens!.refreshToken } as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err: any, session: CognitoUserSession) => {
          if (err) {
            this.log.error('Failed to refresh token:', err.message);
            reject(err);
            return;
          }

          this.tokens = {
            idToken: session.getIdToken().getJwtToken(),
            accessToken: session.getAccessToken().getJwtToken(),
            refreshToken: session.getRefreshToken().getToken(),
            expiresAt: Date.now() + (3600 * 1000),
          };

          this.client.defaults.headers.common.authtoken = this.tokens.idToken;
          this.log.debug('Access token refreshed successfully');
          resolve();
        },
      );
    });
  }

  /**
   * Get all devices
   */
  async getDevices(): Promise<EmporiaDevice[]> {
    try {
      this.log.debug('Fetching devices from Emporia API...');
      const response = await this.client.get('/customers/devices', {
        headers: { authtoken: this.tokens?.idToken },
      });
      // The payload key is "devices". This read "customerDevices" and so
      // had always returned [] -- which is why every outlet fell back to
      // "Emporia Outlet <gid>" despite the name being fetched here.
      return response.data.devices || [];
    } catch (error) {
      this.log.error('Failed to fetch devices:', error);
      throw error;
    }
  }

  /**
   * Get device properties
   */
  async getDeviceProperties(deviceGid: number): Promise<EmporiaDevice> {
    try {
      const response = await this.client.get(
        `/devices/${deviceGid}/locationProperties`,
        {
          headers: { authtoken: this.tokens?.idToken },
        },
      );
      return response.data;
    } catch (error) {
      this.log.error(
        `Failed to fetch properties for device ${deviceGid}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Refresh the gid -> device name map.
   *
   * /customers/devices/status returns outlets carrying only deviceGid,
   * outletOn and loadGid -- no name. The name lives on /customers/devices
   * as locationProperties.deviceName, so the two have to be joined or
   * every outlet falls back to "Emporia Outlet <gid>".
   *
   * Outlets are usually nested under their parent device, hence the walk.
   */
  async refreshDeviceNames(): Promise<void> {
    const walk = (list: EmporiaDevice[]): void => {
      for (const device of list) {
        const name = device.locationProperties?.deviceName;
        if (name) {
          this.deviceNames.set(device.deviceGid, name);
        }
        if (device.devices?.length) {
          walk(device.devices);
        }
      }
    };

    const devices = await this.getDevices();
    this.deviceNames.clear();
    walk(devices);
    this.log.debug(`Cached ${this.deviceNames.size} device name(s)`);
  }

  /**
   * Get outlets, with their Emporia device names attached.
   *
   * Names come from the cache rather than a second request, because this
   * is on the polling path and the names change far more rarely than the
   * state does.
   */
  async getOutlets(): Promise<EmporiaOutlet[]> {
    try {
      this.log.debug('Fetching outlets from Emporia API...');
      const response = await this.client.get('/customers/devices/status', {
        headers: { authtoken: this.tokens?.idToken },
      });
      const outlets: EmporiaOutlet[] = response.data.outlets || [];
      return outlets.map((outlet) => {
        const deviceName = this.deviceNames.get(outlet.deviceGid);
        if (!deviceName || outlet.locationProperties?.deviceName) {
          return outlet;
        }
        return { ...outlet, locationProperties: { deviceName } };
      });
    } catch (error) {
      this.log.error('Failed to fetch outlets:', error);
      throw error;
    }
  }

  /**
   * Instantaneous power for several devices in one request.
   *
   * The per-accessory path used to call getDeviceUsage() once per outlet
   * per poll -- eight requests every 30s here. The API takes a comma
   * separated deviceGids, so one request covers the lot, which is what
   * emvue-exporter does too.
   *
   * Returns watts keyed by deviceGid. A 1MIN scale in KilowattHours is
   * energy for that minute, so watts = kWh * 1000 * 60.
   */
  async getPowerByGid(gids: number[]): Promise<Map<number, number>> {
    const power = new Map<number, number>();
    if (gids.length === 0) {
      return power;
    }

    const url = 'AppAPI?apiMethod=getDeviceListUsages' +
      `&deviceGids=${gids.join(',')}` +
      `&instant=${encodeURIComponent(new Date().toISOString())}` +
      '&scale=1MIN&energyUnit=KilowattHours';

    const response = await this.client.get(url, {
      headers: { authtoken: this.tokens?.idToken },
    });

    const devices = response.data?.deviceListUsages?.devices ?? [];
    for (const device of devices) {
      const usage = device.channelUsages?.[0]?.usage;
      if (typeof usage === 'number') {
        power.set(device.deviceGid, usage * 1000 * 60);
      }
    }
    return power;
  }

  /**
   * Update outlet state
   */
  async updateOutlet(
    deviceGid: number,
    outletOn: boolean,
  ): Promise<EmporiaOutlet> {
    try {
      this.log.debug(
        `Updating outlet ${deviceGid} to ${outletOn ? 'ON' : 'OFF'}`,
      );
      const response = await this.client.put(
        '/devices/outlet',
        {
          deviceGid,
          outletOn,
        },
        {
          headers: { authtoken: this.tokens?.idToken },
        },
      );
      return response.data;
    } catch (error) {
      this.log.error(`Failed to update outlet ${deviceGid}:`, error);
      throw error;
    }
  }

  /**
   * Get EV chargers
   */
  async getChargers(): Promise<EmporiaCharger[]> {
    try {
      this.log.debug('Fetching EV chargers from Emporia API...');
      const response = await this.client.get('/customers/devices/status', {
        headers: { authtoken: this.tokens?.idToken },
      });
      return response.data.evChargers || [];
    } catch (error) {
      this.log.error('Failed to fetch EV chargers:', error);
      throw error;
    }
  }

  /**
   * Update EV charger state
   */
  async updateCharger(
    deviceGid: number,
    chargerOn: boolean,
    chargingRate?: number,
    maxChargingRate?: number,
  ): Promise<EmporiaCharger> {
    try {
      this.log.debug(
        `Updating charger ${deviceGid} to ${chargerOn ? 'ON' : 'OFF'}`,
      );
      const data: Record<string, unknown> = {
        deviceGid,
        chargerOn,
      };

      if (chargingRate !== undefined) {
        data.chargingRate = chargingRate;
      }
      if (maxChargingRate !== undefined) {
        data.maxChargingRate = maxChargingRate;
      }

      const response = await this.client.put('/devices/evcharger', data, {
        headers: { authtoken: this.tokens?.idToken },
      });
      return response.data;
    } catch (error) {
      this.log.error(`Failed to update charger ${deviceGid}:`, error);
      throw error;
    }
  }

  /**
   * Get device usage data
   * Uses PyEmVue's getDeviceListUsages API (works for outlets!)
   * Based on emvue-exporter implementation
   */
  async getDeviceUsage(
    deviceGid: number,
    instant: Date = new Date(),
    scale: string = '1MIN',
    unit: string = 'KilowattHours',
  ): Promise<EmporiaUsageData> {
    try {
      // Format date as ISO 8601 string (like PyEmVue does)
      const instantStr = instant.toISOString();
      
      // Use getDeviceListUsages (plural) - works for outlets
      // No channel parameter needed!
      const url = 'AppAPI?apiMethod=getDeviceListUsages' +
        `&deviceGids=${deviceGid}&instant=${encodeURIComponent(instantStr)}` +
        `&scale=${scale}&energyUnit=${unit}`;
      
      const response = await this.client.get(url, {
        headers: { authtoken: this.tokens?.idToken },
      });
      return response.data;
    } catch (error) {
      this.log.error(
        `Failed to fetch usage for device ${deviceGid}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return (
      this.tokens !== null &&
      this.tokens.expiresAt > Date.now()
    );
  }

  /**
   * Set tokens (for restoring from storage)
   */
  setTokens(tokens: EmporiaTokens, username?: string): void {
    this.tokens = tokens;
    this.client.defaults.headers.common.authtoken = tokens.idToken;
    
    // Recreate Cognito user if username provided
    if (username) {
      this.username = username.toLowerCase();
      const userPool = new CognitoUserPool({
        UserPoolId: this.cognitoUserPoolId,
        ClientId: this.cognitoClientId,
      });
      this.cognitoUser = new CognitoUser({
        Username: this.username,
        Pool: userPool,
      });
    }
  }

  /**
   * Get current tokens
   */
  getTokens(): EmporiaTokens | null {
    return this.tokens;
  }
}

