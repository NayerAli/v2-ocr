# Skeleton Usage List

## app/page.tsx

### 1. Stats Card Skeleton
**Location:** `renderStatsCard` function
```tsx
{isLoadingData || !processingQueue.length ? (
  <div className="space-y-2">
    <div className="h-8 w-16 animate-pulse rounded bg-muted" />
    <div className="h-4 w-24 animate-pulse rounded bg-muted" />
  </div>
) : content}
```
**Condition:**
- Displayed when `isLoadingData` is true or `processingQueue` is empty.

### 2. Recent Documents Skeleton
**Location:** Recent Documents section
```tsx
{isLoadingData ? (
  <div className="space-y-4">
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="flex items-center gap-4">
        <div className="h-12 w-12 rounded bg-muted animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-48 bg-muted rounded animate-pulse" />
          <div className="h-3 w-24 bg-muted rounded animate-pulse" />
        </div>
      </div>
    ))}
  </div>
) : (
  <DocumentList ... />
)}
```
**Condition:**
- Displayed when `isLoadingData` is true.

## app/documents/[id]/page.tsx

### 1. Toolbar Skeleton
**Location:** `renderToolbar` function
```tsx
{isLoading ? (
  <Skeleton className="h-8 w-48" />
) : (...)
```
**Condition:**
- Displayed when `isLoading` is true.

### 2. Page Input Skeleton
**Location:** `renderControls` function
```tsx
{isLoading ? (
  <Skeleton className="h-4 w-12" />
) : isEditingPage ? (
  <Input ... />
) : (...)
```
**Condition:**
- Displayed when `isLoading` is true.

### 3. Image Content Skeleton
**Location:** `renderImageContent` function
```tsx
if (isLoading) {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="relative w-full h-full">
        <Skeleton className="absolute inset-0" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground animate-pulse">Loading document...</p>
          </div>
        </div>
      </div>
    </div>
  )
}
```
**Condition:**
- Displayed when `isLoading` is true.

### 4. Extracted Text Skeleton
**Location:** Extracted Text View
```tsx
{isLoading ? (
  <div className="space-y-3">
    <Skeleton className="h-5 w-full" />
    <Skeleton className="h-5 w-[92%]" />
    <Skeleton className="h-5 w-[88%]" />
    <Skeleton className="h-5 w-[95%]" />
    <Skeleton className="h-5 w-[90%]" />
  </div>
) : (...)
```
**Condition:**
- Displayed when `isLoading` is true.

## app/components/document-list.tsx

### 1. Table/List Skeleton
**Location:** Table loading state
```tsx
if (isLoading) {
  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>...</TableHeader>
        <TableBody>
          {Array.from({ length: 3 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <div className="flex items-center gap-4">
                  <div className="h-4 w-4 rounded bg-muted animate-pulse" />
                  <div className="h-4 w-48 bg-muted rounded animate-pulse" />
                </div>
              </TableCell>
              <TableCell>
                <div className="h-4 w-24 bg-muted rounded animate-pulse" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-24 bg-muted rounded animate-pulse" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-12 bg-muted rounded animate-pulse" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-16 bg-muted rounded animate-pulse" />
              </TableCell>
              <TableCell>
                <div className="flex justify-center">
                  <div className="h-8 w-8 rounded bg-muted animate-pulse" />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```
**Condition:**
- Displayed when `isLoading` is true.

## app/components/file-upload.tsx

### 1. Upload Overlay Skeleton
**Location:** Upload overlay
```tsx
{isUploading && (
  <div className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center rounded-lg">
    <div className="text-center space-y-3">
      <div className="relative">
        <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
        <div className="relative p-4 rounded-full bg-primary/10">
          <Upload className="h-6 w-6 text-primary animate-bounce" />
        </div>
      </div>
      <p className="text-sm font-medium text-primary">{t('uploadingFiles', language)}</p>
    </div>
  </div>
)}
```
**Condition:**
- Displayed when `isUploading` is true.

---

**Note:**
- All skeletons use either the `Skeleton` component or Tailwind utility classes for animated placeholders.
- Conditions are always tied to loading or empty states, such as `isLoading`, `isLoadingData`, or `isUploading`. 