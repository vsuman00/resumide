# A13 policy selection authority

This clarification supplements immutable operation contract `e6c198b11415cfb267c90bf95ff9ef528f8f5d2af2c9557f62b7cff6ad72a717` and schema supplement `131a611d83b081d5d9f1b877e3bbe881bdf34e89ffac77e0b0d76561cd2d6cc9`. Neither document is edited.

Registry seeding and organization policy selection are controlled solely by the database owner or an explicitly authorized database operator. Candidate users, organization application users and service callers have no write permission or RPC to select or switch policy or budget mode. In particular, a service caller cannot choose budget-off when the native operator selection requires budget-on. The request's policy selector only correlates with the actual native selection; a mismatch refuses.

No enabled selection or grant is introduced. Actual descriptors and hashes require their reviewed source exports. This document grants no native execution, activation or release authority.
