import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { IdGenerator } from '../../common/ids/id-generator.js';
import { AuthModule } from '../auth/auth.module.js';

import { DeviceRepository } from './device.repository.js';
import { Device, DeviceSchema } from './device.schema.js';
import { DeviceService } from './device.service.js';
import { DevicesController } from './devices.controller.js';
import { LoginMfaGate } from './login-mfa.gate.js';
import { SESSION_VIEW_FEATURE, SessionViewRepository } from './session-view.repository.js';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';

/**
 * Device recognition, trust and the customer's session security screens.
 *
 * The auth module is imported for the guards every route here sits behind and for
 * `SessionService`, which owns all writes to the `sessions` collection — this module
 * reads sessions through its own read-only model but never writes them directly. The
 * import is a `forwardRef` because the auth module imports this one back for
 * `LoginMfaGate`, which `LoginService` consults after a password verifies.
 *
 * `DeviceService`, `DeviceRepository` and `LoginMfaGate` are exported: passkeys are
 * stored on the device they were registered from (the MFA module), and the login gate is
 * the auth module's hook into device trust.
 */
@Module({
  imports: [
    forwardRef(() => AuthModule),
    MongooseModule.forFeature([{ name: Device.name, schema: DeviceSchema }, SESSION_VIEW_FEATURE]),
  ],
  controllers: [DevicesController, SessionsController],
  providers: [
    IdGenerator,
    DeviceRepository,
    DeviceService,
    LoginMfaGate,
    SessionViewRepository,
    SessionsService,
  ],
  exports: [DeviceService, DeviceRepository, LoginMfaGate],
})
export class DevicesModule {}
