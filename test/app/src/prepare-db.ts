import { getPayload } from 'payload'

import config from './payload.config'

// `next start` bakes NODE_ENV to 'production' into the built bundle, so
// Payload's dev schema push (only active when NODE_ENV !== 'production')
// never runs inside it, leaving the production server with no tables to
// query. Booting Payload here, outside the Next bundle, evaluates that
// check at real runtime and creates the schema and seeds it before the
// production server starts.
await getPayload({ config })
process.exit(0)
