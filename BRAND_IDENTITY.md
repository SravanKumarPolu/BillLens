# BillLens Brand Identity

## 📌 Brand Name

**BillLens**

**Meaning:** A "Lens" that gives clarity, insight, and fairness to every bill.

## 📌 Tagline

**"See Every Expense Clearly."**

Alternative options:
- Clarity in Every Split.
- Fair, Simple, Transparent.
- Bills Made Crystal Clear.

## 🎨 Logo Package

### Primary Logo (Lens + Split Icon)
- **Symbolizes:** Lens frame, expense split, precision
- **Component:** `<Logo variant="primary" />`
- **Usage:** App icon, splash screen, main branding

### Minimal Icon (Lens Dot)
- **Symbolizes:** Simplified lens, clarity focus
- **Component:** `<Logo variant="minimal" />`
- **Usage:** Favicon, small icons, tab bar

## 🎨 Color Palette

### Light Mode

| Token                | Hex         | Usage               |
| -------------------- | ----------- | ------------------- |
| `primary`            | **#4F46E5** | Buttons, highlights |
| `primaryLight`       | **#A5B4FC** | Subtle accents      |
| `surfaceLight`       | **#F7F8FE** | Background          |
| `surfaceCard`        | **#FFFFFF** | Cards, sections     |
| `textPrimary`        | **#1F2937** | Text                |
| `textSecondary`      | **#6B7280** | Secondary text      |
| `success`            | **#10B981** | Settled             |
| `error`              | **#EF4444** | Errors              |
| `warning`            | **#F59E0B** | Alerts              |

### Dark Mode

| Token                | Hex         |
| -------------------- | ----------- |
| `primary`            | **#A5B4FC** |
| `primaryDark`        | **#4338CA** |
| `surfaceLight`       | **#0F0F14** |
| `surfaceCard`        | **#1B1B22** |
| `textPrimary`        | **#F3F4F6** |
| `textSecondary`      | **#A2A2B5** |

## ✨ Glassmorphism UI Tokens

```typescript
// Glassmorphism styles available via theme
import { createGlassStyle, glassCard, glassButton, glassModal } from '../theme/glassmorphism';

// Usage in components
<Card glass={true} />  // Glassmorphism card
<Button variant="glass" />  // Glassmorphism button
```

**Tokens:**
- `glassBg`: `rgba(255, 255, 255, 0.15)`
- `glassBorder`: `1px solid rgba(255, 255, 255, 0.2)`
- `glassRadius`: `18px`
- `glassShadow`: `0 8px 25px rgba(0,0,0,0.12)`

## 📝 Typography System

**Font Family:** Inter or Satoshi (recommended for 2025 modern apps)

**Size Scale (Tailwind-ready):**

| Role           | Style                    | Size  |
| -------------- | ------------------------ | ----- |
| App Title      | `text-3xl font-bold`     | 28px  |
| Section Title  | `text-xl font-semibold`   | 20px  |
| Body           | `text-base`               | 16px  |
| Secondary      | `text-sm text-muted`      | 14px  |
| Caption        | `text-xs text-muted`      | 12px  |

**Note:** React Native uses system fonts by default. To use Inter/Satoshi, install custom fonts.

## 🧩 Component Library

### Buttons

```tsx
// Primary (solid gradient)
<Button variant="primary" title="Add Expense" />

// Secondary (outline)
<Button variant="secondary" title="Cancel" />

// Glass button (subtle background)
<Button variant="glass" title="View Details" />

// Positive (settle up)
<Button variant="positive" title="Settle Up" />
```

### Cards

```tsx
// Standard card
<Card>
  <Text>Content</Text>
</Card>

// Elevated card
<Card elevated>
  <Text>Content</Text>
</Card>

// Glassmorphism card
<Card glass>
  <Text>Content</Text>
</Card>
```

### Tabs

```tsx
<Tabs
  tabs={[
    { id: 'overview', label: 'Overview' },
    { id: 'expenses', label: 'Expenses', badge: 5 },
    { id: 'insights', label: 'Insights' },
    { id: 'history', label: 'History' },
  ]}
  activeTab="overview"
  onTabChange={(id) => setActiveTab(id)}
  variant="glass" // Optional glassmorphism
/>
```

### Logo

```tsx
// Primary logo
<Logo variant="primary" size={120} color="#4F46E5" />

// Minimal icon
<Logo variant="minimal" size={48} />
```

## 🎯 Usage Guidelines

### Colors
- Use `primary` (#4F46E5) for main CTAs and highlights
- Use `primaryLight` for subtle accents and backgrounds
- Use `success` for settled states and positive actions
- Use `error` for errors and negative states
- Use `warning` for alerts and warnings

### Typography
- Use `h1` (28px) for app titles
- Use `h2` (24px) for section headers
- Use `h3` (20px) for subsection headers
- Use `body` (14px) for main content
- Use `caption` (12px) for metadata

### Glassmorphism
- Use for modals and overlays
- Use for subtle card elevations
- Use for secondary buttons
- Don't overuse - maintain hierarchy

### Logo
- Primary logo: Main branding, splash screen
- Minimal icon: Small spaces, favicon, tab bar
- Maintain aspect ratio
- Use brand color (#4F46E5) or white/black for contrast

## 📦 Implementation Status

✅ Color palette updated  
✅ Glassmorphism tokens created  
✅ Logo component created  
✅ Button with glass variant  
✅ Card with glass prop  
✅ Tabs component created  
✅ Typography system documented  

## 🚀 Next Steps

1. **Install react-native-svg** for full SVG logo support:
   ```bash
   npm install react-native-svg
   ```

2. **Add custom fonts** (Inter/Satoshi):
   - Install font files
   - Configure in app.json or load programmatically
   - Update typography.ts with fontFamily

3. **Create modal components** with glassmorphism

4. **Update screens** to use new brand colors and components
