import { AuthProfile } from '@packpanel/protocol';

export const DEFAULT_MS_CLIENT_ID = '00000000402b5328'; // Standard public launcher client ID or custom Azure App ID

export interface DeviceCodeResponse {
  user_code: string;
  device_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message: string;
}

export class MicrosoftAuthenticator {
  private clientId: string;

  constructor(clientId: string = DEFAULT_MS_CLIENT_ID) {
    this.clientId = clientId;
  }

  /**
   * Starts the OAuth2 Device Code flow.
   * Player visits verification_uri and enters user_code.
   */
  async startDeviceCodeFlow(): Promise<DeviceCodeResponse> {
    const params = new URLSearchParams({
      client_id: this.clientId,
      scope: 'XboxLive.signin offline_access'
    });

    const res = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!res.ok) {
      throw new Error(`Erreur lors de l'initiation du code appareil Microsoft : HTTP ${res.status}`);
    }

    return res.json() as Promise<DeviceCodeResponse>;
  }

  /**
   * Polls Microsoft for user authorization.
   */
  async pollForToken(deviceCode: string, intervalSeconds: number = 5, maxAttempts: number = 60): Promise<string> {
    const params = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: this.clientId,
      device_code: deviceCode
    });

    let attempts = 0;
    while (attempts < maxAttempts) {
      attempts++;
      await new Promise(r => setTimeout(r, intervalSeconds * 1000));

      const res = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });

      const data = await res.json() as any;

      if (res.ok && data.access_token) {
        return data.access_token;
      }

      if (data.error === 'authorization_pending') {
        continue;
      }

      if (data.error === 'slow_down') {
        intervalSeconds += 2;
        continue;
      }

      throw new Error(`Échec de l'authentification Microsoft : ${data.error_description || data.error}`);
    }

    throw new Error('Délai d\'authentification Microsoft dépassé.');
  }

  /**
   * Exchanges a Microsoft OAuth2 access token for a Minecraft AuthProfile.
   */
  async loginWithMicrosoftToken(msAccessToken: string): Promise<AuthProfile> {
    // 1. Authenticate with Xbox Live
    const xblRes = await fetch('https://user.auth.xboxlive.com/user/authenticate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        Properties: {
          AuthMethod: 'RPS',
          SiteName: 'user.auth.xboxlive.com',
          RpsTicket: `d=${msAccessToken}`
        },
        RelyingParty: 'http://auth.xboxlive.com',
        TokenType: 'JWT'
      })
    });

    if (!xblRes.ok) {
      throw new Error(`Échec de l'authentification Xbox Live (HTTP ${xblRes.status})`);
    }

    const xblData = await xblRes.json() as any;
    const xblToken = xblData.Token;
    const userHash = xblData.DisplayClaims?.xui?.[0]?.uhs;

    if (!xblToken || !userHash) {
      throw new Error('Jeton ou identifiant Xbox Live manquant.');
    }

    // 2. Authorize with XSTS
    const xstsRes = await fetch('https://xsts.auth.xboxlive.com/xsts/authorize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        Properties: {
          SandboxId: 'RETAIL',
          UserTokens: [xblToken]
        },
        RelyingParty: 'rp://api.minecraftservices.com/',
        TokenType: 'JWT'
      })
    });

    if (!xstsRes.ok) {
      const errData = await xstsRes.json().catch(() => ({})) as any;
      if (errData.XErr === 2148916233) {
        throw new Error('Le compte Microsoft ne possède pas de compte Xbox Live.');
      } else if (errData.XErr === 2148916238) {
        throw new Error('Ce compte Xbox Live est un compte enfant nécessitant l\'approbation parentale.');
      }
      throw new Error(`Échec de l'autorisation XSTS (HTTP ${xstsRes.status})`);
    }

    const xstsData = await xstsRes.json() as any;
    const xstsToken = xstsData.Token;

    // 3. Login to Minecraft Services
    const mcLoginRes = await fetch('https://api.minecraftservices.com/authentication/login_with_xbox', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        identityToken: `XBL3.0 x=${userHash};${xstsToken}`
      })
    });

    if (!mcLoginRes.ok) {
      throw new Error(`Échec de la connexion aux services Minecraft (HTTP ${mcLoginRes.status})`);
    }

    const mcData = await mcLoginRes.json() as any;
    const mcAccessToken = mcData.access_token;

    // 4. Fetch Minecraft Game Profile
    const profileRes = await fetch('https://api.minecraftservices.com/minecraft/profile', {
      headers: {
        'Authorization': `Bearer ${mcAccessToken}`
      }
    });

    if (!profileRes.ok) {
      if (profileRes.status === 404) {
        throw new Error('Ce compte Microsoft ne possède pas de licence Minecraft Java Edition.');
      }
      throw new Error(`Échec de la récupération du profil Minecraft (HTTP ${profileRes.status})`);
    }

    const profileData = await profileRes.json() as any;

    return {
      id: profileData.id,
      name: profileData.name,
      userType: 'microsoft',
      accessToken: mcAccessToken
    };
  }
}
