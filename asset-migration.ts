import fetch from 'node-fetch';
import 'dotenv/config'
import { readFile, writeFile, unlink } from 'fs/promises';
import path from 'path';
import { z } from 'zod';

const {
    SOURCE_STORE_TOKEN,
    SOURCE_STORE_URL,
    DESTINATION_STORE_TOKEN,
    DESTINATION_STORE_URL,
    DESTINATION_STORE_THEME,
} = process.env;


type Asset = {
    attachment: string;
    content_type: string;
    key: string;
    public_url: string;
    size: number;
    theme_id: number;
    value: string;

}
type Theme = {
    id: number;
    name: string;
    role: string;
}

type ThemesResponse = {
    themes: Theme[];
}

/*
const AssetSchema = z.object({
  attachment: z.string().optional(),
  content_type: z.string(),
  key: z.string(),
  public_url: z.string().url().optional(),
  size: z.number(),
  theme_id: z.number(),
  value: z.string().optional(),
});
*/

const processAssets = async (assets: Asset[], themeId: string) => {
    for (const asset of assets) {
        if (asset.public_url) {
            console.log(`Migrating asset: ${asset.key}`);
            const fileName = await downloadAsset(asset.public_url, themeId);
            await uploadAsset(fileName as string, asset.key, themeId);
            // console.log(`Successfully migrated: ${asset.key}`);
        }
    }
}

const query = async <T>(domain: string, token: string, endpoint: string): Promise<T | undefined> => {
    try {
        const url = `${domain}${endpoint}`;
        // console.log('url', url);
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-Shopify-Access-Token': token,
                'Content-Type': 'applicaiton/json',
            },
        });
        // console.log(response)
        if (!response.ok) {
            if (response instanceof Response) {
                throw new Error(`Error fetching ${endpoint}: ${response.statusText}`);
            }
            return undefined;
        }
        return response.json() as Promise<T>;;
    
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.log(error.message)
        }
    }
}

const downloadAsset = async (url: string, key: string): Promise<unknown> => {
    try {

        const response = await fetch(url);
        if (!response.ok) {
            if (response instanceof Response) {
                throw new Error(`Error downloading ${key}: ${response.statusText}`);
            }
        }
        const buffer = await response.buffer();
        const fileName = path.basename(key);
        await writeFile(fileName, buffer);
        return fileName;

    } catch (error: unknown) {
        if (error instanceof Error) {
            console.log(error.message)
        }
    }
}

const uploadAsset = async (fileName: string, key: string, themeId: string): Promise<void> => {
    try {
        if (!DESTINATION_STORE_TOKEN) { // type guard for use in header
            throw new Error('Destination store token is not defined');
        }

        const buffer = await readFile(fileName);
        const base64data = buffer.toString('base64');
        const data = {
            asset: {
                key: key,
                attachment: base64data,
            },
        };

        const url = `${DESTINATION_STORE_URL}themes/${themeId}/assets.json`;
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
              'X-Shopify-Access-Token': DESTINATION_STORE_TOKEN,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
          });
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error uploading ${key}: ${response.status} - ${errorText}`);
          }
          await unlink(fileName); // clean up local file after upload
          

    } catch (error: unknown) {
        if (error instanceof Error) {
            console.log(error.message)
        }
    }
}

const migrateAssets = async () => {
    try {
        if (!SOURCE_STORE_URL) { // type guard for use in header
            throw new Error('Destination store token is not defined');
        }
        if (!SOURCE_STORE_TOKEN) { // type guard for use in header
            throw new Error('Destination store token is not defined');
        }
        // fetch list of themes from source store
        const sourceThemes = await query<ThemesResponse>(
            SOURCE_STORE_URL, 
            SOURCE_STORE_TOKEN, 
            'themes.json'
        )

        if (!sourceThemes) {
            throw new Error('no theme found in source store.');
        }

        const sourceTheme = sourceThemes.themes.find(
            (theme) => theme.role === 'main'
        );
        if (!sourceTheme) {
            throw new Error('Main theme not found in source store.');
        }

        // fetch list of assets from source store's main theme
        const response = await query<{ assets: unknown[] }>(
            SOURCE_STORE_URL,
            SOURCE_STORE_TOKEN,
            `themes/${sourceTheme.id}/assets.json`
        )
        if (!response) {
            throw new Error('No assets found in source store.');
        }
        const assets = response.assets;

        // fetch list of themes fromom destination store
        // if (!DESTINATION_STORE_URL) {
        //     throw new Error('Destination store url is not defined');
        // }
        // if (!DESTINATION_STORE_TOKEN) {
        //     throw new Error('Destination store token is not defined');
        // }

        const destinationThemes = await query<ThemesResponse>(
            DESTINATION_STORE_URL as string,
            DESTINATION_STORE_TOKEN as string,
            'themes.json'
        );
        const destinationTheme = destinationThemes?.themes.find(
            (theme) => theme.name === DESTINATION_STORE_THEME
        );
        if (!destinationTheme) {
        throw new Error('Main theme not found in destination store.');
        }
        const destinationThemeId = destinationTheme.id;

        processAssets(assets as Asset[], destinationThemeId.toString());


    } catch (error: unknown) {
        if (error instanceof Error) {
            console.log('failed migrating: ',error.message)
        }
    }
}

migrateAssets();


// npx tsx asset-migration.ts