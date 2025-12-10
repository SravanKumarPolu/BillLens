# Button Gradient Implementation

## ✅ Current Implementation

The Button component now includes a gradient effect for the `primary` variant. The implementation uses a visual gradient simulation technique that works **without any external dependencies**.

### How It Works

1. **Base Layer**: Solid primary color background (`#4F46E5`)
2. **Highlight Layer**: Semi-transparent primaryLight overlay on top 60% (`#A5B4FC` at 40% opacity)
3. **Content Layer**: Text/content rendered on top with proper z-index

This creates a subtle gradient effect from lighter at the top to darker at the bottom, giving the button depth and visual interest.

### Usage

```tsx
<Button 
  variant="primary" 
  title="Add Expense" 
  onPress={handlePress} 
/>
```

The gradient effect is automatically applied to all primary buttons.

## 🚀 Production-Quality Option

For a **true linear gradient** with better visual quality, you can install `react-native-linear-gradient`:

### Installation

```bash
npm install react-native-linear-gradient
# or
pnpm add react-native-linear-gradient

# For iOS (if using bare React Native)
cd ios && pod install
```

### Alternative Implementation (Optional)

If you install `react-native-linear-gradient`, you can update the Button component to use it:

```tsx
import LinearGradient from 'react-native-linear-gradient';

// In Button component, replace gradient section with:
if (variant === 'primary' && !disabled && !loading) {
  return (
    <TouchableOpacity
      style={[styles.base, fullWidth && styles.fullWidth, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={[colors.primaryLight, colors.primary, colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.gradientContainer}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : (
          <Text style={labelStyle}>{title}</Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}
```

## 📊 Comparison

| Approach | Pros | Cons |
|----------|------|------|
| **Current (Visual Effect)** | ✅ No dependencies<br>✅ Works immediately<br>✅ Lightweight | ⚠️ Not a true gradient<br>⚠️ Limited customization |
| **react-native-linear-gradient** | ✅ True gradient<br>✅ Highly customizable<br>✅ Production quality | ⚠️ Requires installation<br>⚠️ Native linking needed |

## ✅ Recommendation

The current implementation is **production-ready** and provides a visually appealing gradient effect without adding dependencies. For most use cases, this is sufficient.

If you need:
- More complex gradients (radial, multiple stops)
- Better performance on older devices
- Pixel-perfect gradient matching design specs

Then consider installing `react-native-linear-gradient`.

## 🎨 Gradient Colors

The gradient uses the brand colors:
- **Top**: `primaryLight` (#A5B4FC) - 40% opacity
- **Base**: `primary` (#4F46E5) - solid
- **Effect**: Creates a subtle light-to-dark gradient

This matches the BillLens brand identity and provides visual depth to primary action buttons.
