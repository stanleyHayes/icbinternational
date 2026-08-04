import { DeviceTrust } from '@reliance/contracts';

import { ClockService } from '../../../common/clock/clock.service.js';
import { AppError } from '../../../common/errors/app-error.js';
import { IdGenerator } from '../../../common/ids/id-generator.js';
import { type DeviceDocument, type DevicePasskey } from '../device.schema.js';
import { DeviceService, type DeviceSighting } from '../device.service.js';

const USER_ID = 'usr_01HZY0M4V0D2T0FH0GN3J1Q0AA';
const OTHER_USER_ID = 'usr_01HZY1N8W1E3U1GI1HP4K2R1BB';
const SIGHTING: DeviceSighting = {
  userId: USER_ID,
  fingerprint: 'fp-unit-test-0000001',
  origin: { ip: '198.51.100.7', userAgent: 'Mozilla/5.0 Chrome/126.0.0.0' },
};

/** In-memory DeviceRepository double covering exactly the methods DeviceService calls. */
class FakeDeviceRepository {
  readonly rows: DeviceDocument[] = [];

  async findByFingerprint(userId: string, fingerprint: string): Promise<DeviceDocument | null> {
    return (
      this.rows.find((row) => row.userId === userId && row.fingerprint === fingerprint) ?? null
    );
  }

  async upsert(record: {
    id: string;
    userId: string;
    fingerprint: string;
    label: string;
    platform: string;
    trust: DeviceTrust;
    firstSeenAt: Date;
    lastSeenAt: Date;
  }): Promise<DeviceDocument> {
    const existing = await this.findByFingerprint(record.userId, record.fingerprint);
    if (existing) {
      existing.lastSeenAt = record.lastSeenAt;
      return existing;
    }
    const row = {
      ...record,
      hasPasskey: false,
      passkeys: [] as DevicePasskey[],
      createdAt: record.firstSeenAt,
      updatedAt: record.firstSeenAt,
    } as unknown as DeviceDocument;
    this.rows.push(row);
    return row;
  }

  async setTrust(id: string, trust: DeviceTrust): Promise<DeviceDocument | null> {
    const row = this.rows.find((entry) => entry.id === id);
    if (!row) return null;
    row.trust = trust;
    return row;
  }

  async findById(id: string): Promise<DeviceDocument | null> {
    return this.rows.find((entry) => entry.id === id) ?? null;
  }

  async findForUser(userId: string): Promise<DeviceDocument[]> {
    return this.rows.filter((entry) => entry.userId === userId);
  }
}

function build(): { service: DeviceService; repo: FakeDeviceRepository } {
  const repo = new FakeDeviceRepository();
  const service = new DeviceService(
    repo as unknown as ConstructorParameters<typeof DeviceService>[0],
    new IdGenerator(),
    new ClockService(),
  );
  return { service, repo };
}

describe('DeviceService.recognise', () => {
  it('creates an UNKNOWN device on first sight', async () => {
    const { service } = build();

    const result = await service.recognise(SIGHTING);

    expect(result.isFirstSighting).toBe(true);
    expect(result.device.trust).toBe(DeviceTrust.UNKNOWN);
    expect(result.device.label).toBe('Chrome on Unknown platform');
    expect(result.device.id.startsWith('dev_')).toBe(true);
  });

  it('promotes a returning device to RECOGNISED without duplicating it', async () => {
    const { service, repo } = build();

    await service.recognise(SIGHTING);
    const result = await service.recognise(SIGHTING);

    expect(result.isFirstSighting).toBe(false);
    expect(repo.rows).toHaveLength(1);
    const [row] = repo.rows;
    expect(row?.trust).toBe(DeviceTrust.RECOGNISED);
  });

  it('never demotes a TRUSTED device on a later sighting', async () => {
    const { service, repo } = build();
    const first = await service.recognise(SIGHTING);
    await service.trust(USER_ID, first.device.id);

    await service.recognise(SIGHTING);

    const [row] = repo.rows;
    expect(row?.trust).toBe(DeviceTrust.TRUSTED);
  });
});

describe('DeviceService trust lifecycle', () => {
  it('blocks and trusts a device the caller owns', async () => {
    const { service } = build();
    const { device } = await service.recognise(SIGHTING);

    const trusted = await service.trust(USER_ID, device.id);
    expect(trusted.trust).toBe(DeviceTrust.TRUSTED);

    const blocked = await service.block(USER_ID, device.id);
    expect(blocked.trust).toBe(DeviceTrust.BLOCKED);
    expect(() => service.assertNotBlocked(device)).toThrow(/blocked/i);
  });

  it('answers a foreign device id with not-found, not forbidden', async () => {
    const { service } = build();
    const { device } = await service.recognise(SIGHTING);

    const failure = await service.trust(OTHER_USER_ID, device.id).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect((failure as AppError).code).toBe('NOT_FOUND');
  });
});
