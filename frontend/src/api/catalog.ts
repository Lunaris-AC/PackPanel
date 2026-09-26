import { api } from './client';
import {
  MinecraftVersionSummary,
  LoaderCompatibilitySummary,
  LoaderVersionEntry,
  JavaRequirement,
  LoaderType
} from '../types';

export interface CatalogVersionsResponse {
  versions: MinecraftVersionSummary[];
  latestRelease: string;
  latestSnapshot: string;
}

export interface CatalogLoadersResponse {
  mcVersion: string;
  loaders: LoaderCompatibilitySummary[];
}

export interface CatalogLoaderVersionsResponse {
  loader: LoaderType;
  mcVersion: string;
  versions: LoaderVersionEntry[];
}

export interface CatalogRequirementsResponse {
  requirement: JavaRequirement;
}

export interface CatalogValidateResponse {
  valid: boolean;
  error?: string;
  resolvedLoaderVersion?: string;
  javaRequirement: JavaRequirement;
}

export const catalogApi = {
  getMinecraftVersions: () =>
    api.get<CatalogVersionsResponse>('/v2/catalog/minecraft'),

  getCompatibleLoaders: (mcVersion: string) =>
    api.get<CatalogLoadersResponse>('/v2/catalog/loaders', { mcVersion }),

  getLoaderVersions: (loader: LoaderType, mcVersion: string) =>
    api.get<CatalogLoaderVersionsResponse>('/v2/catalog/loader-versions', { loader, mcVersion }),

  getRequirements: (mcVersion: string, loader?: LoaderType) =>
    api.get<CatalogRequirementsResponse>('/v2/catalog/requirements', { mcVersion, loader }),

  validateCombination: (mcVersion: string, loader: LoaderType, loaderVersion?: string) =>
    api.post<CatalogValidateResponse>('/v2/catalog/validate', {
      mcVersion,
      loader,
      loaderVersion: loaderVersion || undefined
    })
};
