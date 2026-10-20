/**
 * Global JSX namespace shim (React 19 migration).
 *
 * React 19 moved the global `JSX` namespace to `React.JSX` and removed the
 * ambient global declaration from `@types/react`. The BillLens codebase
 * uses the long-standing React Native convention `function f():
 * JSX.Element` across its presentation layer (80+ files); migrating every
 * signature to `React.JSX.Element` would be a large, zero-behavioural-
 * value churn.
 *
 * This shim re-exposes the React 19 JSX namespace types under the legacy
 * global name so existing signatures remain valid, while the underlying
 * types are EXACTLY React's own (no re-declaration drift). New code is
 * encouraged to use `React.JSX.Element` or import `type { JSX } from
 * 'react'` directly; this shim only preserves compatibility.
 */

import type { JSX as ReactJSX } from 'react';

declare global {
  namespace JSX {
    type Element = ReactJSX.Element;
    type ElementClass = ReactJSX.ElementClass;
    type ElementAttributesProperty = ReactJSX.ElementAttributesProperty;
    type ElementChildrenAttribute = ReactJSX.ElementChildrenAttribute;
    type IntrinsicAttributes = ReactJSX.IntrinsicAttributes;
    type IntrinsicClassAttributes<T> = ReactJSX.IntrinsicClassAttributes<T>;
    type IntrinsicElements = ReactJSX.IntrinsicElements;
  }
}

export {};
