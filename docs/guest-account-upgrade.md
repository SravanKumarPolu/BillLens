# BillLens — guest account upgrade

> Status: **Phase 3 complete.**

This document covers the guest account upgrade implementation for BillLens Phase 3.

## Summary

Implemented as part of Phase 3 identity, authentication, and access control foundation.

## Key decisions

- Architecture follows the Phase 1 domain-driven design
- All sensitive data uses SecureStore
- No service-role keys in the mobile app
- Guest identity is a first-class identity mode
- Provider identity uses stable subject identifiers, not email alone
- Permission checks are centralized in the domain layer

## Implementation

See the corresponding use cases and domain services in:
- `src/application/identity/`
- `src/application/invitations/`
- `src/application/groups/`
- `src/domain/services/permissions/`
