import { IsString, Length } from 'class-validator';

/**
 * Input for POST /gate/scan. We only assert the basic SHAPE here — the token's
 * authenticity (HMAC) and the subject's authorization are decided server-side by
 * the use-case, never trusted from the client.
 */
export class ScanBarcodeDto {
  @IsString()
  @Length(1, 512)
  readonly barcode!: string;
}
