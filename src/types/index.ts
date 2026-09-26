/** Shared domain types for the subconverter WebUI. */

/** Target output format understood by subconverter (clash, surge, v2ray, ...). */
export type Target =
  | 'clash'
  | 'clashr'
  | 'quan'
  | 'quanx'
  | 'loon'
  | 'ss'
  | 'ssr'
  | 'surfboard'
  | 'surge'
  | 'v2ray'
  | 'singbox'
  | 'mixed'
  | (string & {});

/** Parameters accepted by the subconverter `/sub` endpoint. */
export interface ConversionParams {
  /** Output format, e.g. "clash". Required. */
  target: Target;
  /** One or more source subscription URLs (joined with `|`). Required. */
  url: string[];
  /** Optional external config template URL. */
  config?: string;
  /** Add emoji to node names. */
  emoji?: boolean;
  /** Enable UDP. */
  udp?: boolean;
  /** Rename nodes using the subscription's display name. */
  newName?: boolean;
  /** Append the node type to the name. */
  appendType?: boolean;
  /** Refresh interval in seconds. */
  interval?: number;
}

/** Shape returned by the subconverter `/version` endpoint. */
export interface VersionInfo {
  version: string;
  [key: string]: unknown;
}

/** Result state of a conversion request, used by the `useConversion` hook. */
export type ConversionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; content: string }
  | { status: 'error'; error: string };
