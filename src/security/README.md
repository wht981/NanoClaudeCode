# Security Layer

Comprehensive security layer for NanoClaudecode with confirmation system, sandboxed command execution, and audit logging.

## Features

### 1. Confirmation System (`confirmation.ts`)

Risk-based confirmation system for dangerous operations with customizable handlers.

**Risk Levels:**
- `LOW`: Safe operations (auto-approved without handler)
- `MEDIUM`: Potentially risky operations (auto-approved without handler)
- `HIGH`: Dangerous operations (auto-denied without handler)
- `CRITICAL`: Extremely dangerous operations (auto-denied without handler)

**Usage:**

```typescript
import {
  requestConfirmation,
  withConfirmation,
  setConfirmationHandler,
  DangerousOperations,
  RiskLevel,
} from './security';

// Set up custom confirmation handler
setConfirmationHandler(async (request) => {
  const userResponse = await promptUser(request.description);
  return {
    approved: userResponse === 'yes',
    timestamp: new Date(),
    reason: userResponse,
  };
});

// Request confirmation for an operation
const confirmation = await requestConfirmation({
  operation: 'file.delete',
  description: 'Delete important.txt',
  riskLevel: RiskLevel.HIGH,
  affectedResources: ['important.txt'],
});

// Or use withConfirmation wrapper
await withConfirmation(
  DangerousOperations.FILE_DELETE(['important.txt']),
  async () => {
    // Perform deletion
    await fs.unlink('important.txt');
  }
);
```

**Predefined Dangerous Operations:**
- `FILE_DELETE`: Delete files (HIGH)
- `FILE_OVERWRITE`: Overwrite files (MEDIUM)
- `COMMAND_EXECUTE`: Execute commands (HIGH/CRITICAL based on shell usage)
- `DIRECTORY_DELETE`: Delete directories (HIGH/CRITICAL based on recursive flag)
- `NETWORK_REQUEST`: Make network requests (LOW/MEDIUM based on method)
- `ENVIRONMENT_MODIFY`: Modify environment variables (MEDIUM)

### 2. Sandbox System (`sandbox.ts`)

Isolated command execution environment with automatic risk assessment and restrictions.

**Features:**
- Automatic command risk assessment
- Dangerous pattern detection
- Timeout enforcement
- Environment isolation
- Path validation
- Network access control

**Usage:**

```typescript
import { executeSandboxed, executeShellCommand } from './security';

// Execute a sandboxed command
const result = await executeSandboxed('npm', ['install'], {
  timeout: 30000, // 30 seconds
  cwd: '/project/path',
  allowNetwork: true,
  requireConfirmation: true,
});

console.log(result.stdout);
console.log(result.exitCode);
console.log(result.duration);

// Execute shell command (always requires CRITICAL confirmation)
const shellResult = await executeShellCommand('npm install && npm test', {
  timeout: 60000,
});
```

**Configuration Options:**
- `timeout`: Maximum execution time in milliseconds (default: 30000)
- `cwd`: Working directory (default: process.cwd())
- `env`: Environment variables (default: {})
- `allowNetwork`: Allow network access (default: false)
- `allowedPaths`: Restrict file access to specific paths (default: [])
- `maxMemory`: Maximum memory usage in MB (default: 512)
- `requireConfirmation`: Require user confirmation (default: true)

**Dangerous Pattern Detection:**
- `rm -rf` / `del /s`
- `format` commands
- Fork bombs
- `chmod 777`
- Pipe to shell (`wget | sh`, `curl | bash`)
- Disk operations (`dd`, `mkfs`)
- System commands (`shutdown`, `reboot`)

### 3. Audit Logging (`audit.ts`)

Comprehensive audit logging for all security-sensitive operations.

**Event Types:**
- Confirmation: `CONFIRMATION_REQUESTED`, `CONFIRMATION_APPROVED`, `CONFIRMATION_DENIED`
- Commands: `COMMAND_EXECUTED`, `COMMAND_FAILED`, `COMMAND_TIMEOUT`, `COMMAND_BLOCKED`
- Files: `FILE_READ`, `FILE_WRITE`, `FILE_DELETE`, `FILE_MODIFY`
- Network: `NETWORK_REQUEST`, `NETWORK_RESPONSE`, `NETWORK_ERROR`
- Security: `SECURITY_VIOLATION`, `PERMISSION_DENIED`, `SUSPICIOUS_ACTIVITY`
- System: `SESSION_START`, `SESSION_END`, `CONFIGURATION_CHANGE`

**Severity Levels:**
- `DEBUG`: Detailed debugging information
- `INFO`: Informational messages
- `WARNING`: Warning messages
- `ERROR`: Error messages
- `CRITICAL`: Critical issues

**Usage:**

```typescript
import {
  initializeAuditLogger,
  getAuditLogger,
  logAuditEvent,
  AuditEventType,
  AuditSeverity,
} from './security';

// Initialize with custom config
initializeAuditLogger({
  logPath: '.security/audit.log',
  enableConsole: true,
  enableFile: true,
  minimumSeverity: AuditSeverity.INFO,
  maxFileSize: 100, // MB
  retentionDays: 90,
});

// Log an event
await logAuditEvent(
  AuditEventType.COMMAND_EXECUTED,
  'Executed npm install',
  {
    severity: AuditSeverity.INFO,
    actor: 'user123',
    resource: 'project',
    metadata: { duration: 5000 },
    result: 'success',
  }
);

// Query logs
const logger = getAuditLogger();
const events = await logger.query({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31'),
  type: AuditEventType.SECURITY_VIOLATION,
  severity: AuditSeverity.CRITICAL,
  limit: 100,
});

// Add event listener
logger.addEventListener((event) => {
  if (event.severity === AuditSeverity.CRITICAL) {
    notifyAdmin(event);
  }
});
```

## Initialization

Initialize the entire security layer at once:

```typescript
import { initializeSecurity } from './security';

await initializeSecurity({
  auditConfig: {
    logPath: '.security/audit.log',
    enableFile: true,
    minimumSeverity: AuditSeverity.INFO,
  },
  confirmationHandler: async (request) => {
    // Custom confirmation logic
    return {
      approved: true,
      timestamp: new Date(),
    };
  },
});
```

## Testing

Run the comprehensive test suite:

```bash
# Run all security tests
bun test src/security/__tests__

# Run individual test suites
bun test src/security/__tests__/confirmation.test.ts
bun test src/security/__tests__/sandbox.test.ts
bun test src/security/__tests__/audit.test.ts
bun test src/security/__tests__/integration.test.ts
```

**Test Coverage:**
- 18 confirmation system tests
- 26 sandbox execution tests
- 19 audit logging tests
- 7 integration tests
- **Total: 70 tests**

## Architecture

### Confirmation Flow
1. Operation initiates
2. Risk level assessed
3. Confirmation request created
4. Handler invoked (or auto-approve/deny)
5. Response returned
6. Operation proceeds or throws error

### Sandbox Flow
1. Command submitted
2. Risk assessment performed
3. Dangerous patterns checked
4. Confirmation requested (if needed)
5. Process spawned with restrictions
6. Timeout enforced
7. Output captured
8. Results returned

### Audit Flow
1. Event occurs
2. Severity checked against minimum
3. Event buffered
4. Listeners notified
5. Console logged (if enabled)
6. Buffer flushed to file periodically
7. Events queryable from file

## Best Practices

1. **Always use confirmation for user-initiated operations**
   ```typescript
   await withConfirmation(
     DangerousOperations.FILE_DELETE(files),
     async () => deleteFiles(files)
   );
   ```

2. **Use sandbox for all command executions**
   ```typescript
   const result = await executeSandboxed(cmd, args, {
     timeout: 30000,
     requireConfirmation: true,
   });
   ```

3. **Log all security-sensitive operations**
   ```typescript
   await logAuditEvent(
     AuditEventType.COMMAND_EXECUTED,
     description,
     { severity: AuditSeverity.INFO, result: 'success' }
   );
   ```

4. **Set up proper confirmation handlers**
   ```typescript
   setConfirmationHandler(async (request) => {
     // Show UI prompt to user
     // Return user's decision
   });
   ```

5. **Monitor audit logs for suspicious activity**
   ```typescript
   logger.addEventListener((event) => {
     if (event.type === AuditEventType.SUSPICIOUS_ACTIVITY) {
       alertSecurityTeam(event);
     }
   });
   ```

## Security Considerations

- **Never bypass confirmation for CRITICAL operations**
- **Always validate paths before file operations**
- **Restrict network access by default**
- **Use timeouts to prevent DoS**
- **Monitor audit logs regularly**
- **Keep audit logs secure and tamper-proof**
- **Rotate log files based on retention policy**
- **Review CRITICAL severity events immediately**

## License

Part of NanoClaudecode - Enterprise AI coding assistant
