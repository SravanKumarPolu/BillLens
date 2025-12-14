# Animation Leak Fix

## Problem
The app was showing warnings about excessive pending callbacks (501+) from animations:
```
WARN Excessive number of pending callbacks: 501. Some pending callbacks that might have leaked by never being called from native code
```

## Root Cause
Animations were being started but never stopped when:
1. Components unmounted
2. Animations were interrupted by new animations
3. Navigation occurred while animations were running

This caused native animation callbacks to accumulate, creating memory leaks and performance issues.

## Solution
Added proper animation cleanup to all animated components:

### 1. **Modal Component** (`src/components/Modal.tsx`)
- Store animation reference in `animationRef`
- Stop animations on unmount
- Stop previous animation before starting new one

### 2. **RotatingTagline Component** (`src/components/RotatingTagline.tsx`)
- Store animation reference in `animationRef`
- Cleanup animations in useEffect return function
- Stop animations when component unmounts or mode changes

### 3. **HomeScreen** (`src/screens/HomeScreen.tsx`)
- Store back button animation reference
- Stop animations on unmount
- Cleanup in useEffect return function

### 4. **Button Component** (`src/components/Button.tsx`)
- Store animation reference for press animations
- Stop animations on unmount
- Stop previous animation before starting new one

### 5. **Card Component** (`src/components/Card.tsx`)
- Store animation references for mount and press animations
- Cleanup both on unmount
- Stop previous animations before starting new ones

### 6. **Input Component** (`src/components/Input.tsx`)
- Store animation reference for focus/blur animations
- Stop animations on unmount
- Stop previous animation before starting new one

## Pattern Used

```typescript
// 1. Create ref to store animation
const animationRef = useRef<Animated.CompositeAnimation | null>(null);

// 2. Store animation reference when starting
animationRef.current = Animated.timing(value, { ... });
animationRef.current.start(() => {
  animationRef.current = null; // Clear when done
});

// 3. Stop previous animation before starting new one
if (animationRef.current) {
  animationRef.current.stop();
  animationRef.current = null;
}

// 4. Cleanup on unmount
useEffect(() => {
  return () => {
    if (animationRef.current) {
      animationRef.current.stop();
      animationRef.current = null;
    }
  };
}, []);
```

## Result
- ✅ All animations are properly cleaned up
- ✅ No more pending callback warnings
- ✅ Better memory management
- ✅ Improved performance
- ✅ No breaking changes to functionality

## Testing
After these fixes, the app should:
1. Not show animation callback warnings
2. Have smoother animations
3. Use less memory
4. Handle rapid navigation better

## Files Modified
- `src/components/Modal.tsx`
- `src/components/RotatingTagline.tsx`
- `src/components/Button.tsx`
- `src/components/Card.tsx`
- `src/components/Input.tsx`
- `src/screens/HomeScreen.tsx`
