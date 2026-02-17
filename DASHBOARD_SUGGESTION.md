# dry-dock Dashboard UI Suggestion

This document outlines a suggested React/Tailwind structure for the dry-dock dashboard.

## Component Architecture

### 1. `LeakageMatrix`
Visualizes which projects share the most code.
- **Rows/Cols**: Project names.
- **Cells**: Number of shared clones or total RefactorScore.
- **Interactivity**: Clicking a cell filters the clone list to show only leakage between those two projects.

```tsx
const LeakageMatrix = ({ projects, leakageData }) => {
  return (
    <div className="overflow-x-auto p-4 bg-white rounded shadow">
      <h2 className="text-xl font-bold mb-4">Project Leakage Matrix</h2>
      <table className="min-w-full border-collapse">
        <thead>
          <tr>
            <th className="border p-2"></th>
            {projects.map(p => <th key={p} className="border p-2 rotate-45">{p}</th>)}
          </tr>
        </thead>
        <tbody>
          {projects.map(p1 => (
            <tr key={p1}>
              <td className="border p-2 font-semibold">{p1}</td>
              {projects.map(p2 => {
                const count = getSharedCount(p1, p2, leakageData);
                return (
                  <td key={p2} className={`border p-2 text-center ${count > 0 ? 'bg-red-100' : 'bg-green-50'}`}>
                    {p1 === p2 ? '-' : count}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```

### 2. `CloneInspector` (Side-by-Side Viewer)
Uses a diff-like viewer to show normalized code and original source.

```tsx
const CloneInspector = ({ clone }) => {
  const [occ1, occ2] = clone.occurrences;
  return (
    <div className="grid grid-cols-2 gap-4 h-[500px]">
      <div className="border rounded flex flex-col">
        <div className="bg-gray-100 p-2 border-b font-mono text-sm">{occ1.file} ({occ1.project})</div>
        <pre className="p-4 overflow-auto flex-1 text-xs"><code>{/* Source code 1 */}</code></pre>
      </div>
      <div className="border rounded flex flex-col">
        <div className="bg-gray-100 p-2 border-b font-mono text-sm">{occ2.file} ({occ2.project})</div>
        <pre className="p-4 overflow-auto flex-1 text-xs"><code>{/* Source code 2 */}</code></pre>
      </div>
    </div>
  );
};
```

### 3. `RefactorLeaderboard`
Lists clones sorted by `RefactorScore`.
- Tabs for "Internal Duplicates" and "Cross-Project Leakage".
- Badges for `Spread`, `Frequency`, and `Lines`.

```tsx
const RefactorLeaderboard = ({ report }) => {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-red-600">Cross-Project Leakage</h2>
        <div className="mt-4 grid gap-4">
          {report.cross_project_leakage.map(item => (
            <div key={item.hash} className="p-4 border-l-4 border-red-500 bg-white shadow-sm flex justify-between items-center">
              <div>
                <div className="font-mono text-sm text-gray-500">Hash: {item.hash.slice(0, 8)}...</div>
                <div className="text-lg font-semibold">{item.lines} lines shared across {item.projects.join(', ')}</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-600">{item.score.toLocaleString()}</div>
                <div className="text-xs text-gray-400 uppercase tracking-wider">RefactorScore</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
```

## Integration Flow
1. **Data Ingest**: Fetch `drydock-report.json`.
2. **Global State**: Store the report and the currently selected clone.
3. **Filtering**: Allow users to filter by project or minimum score.
4. **Action**: "Open in VS Code" links for occurrences.
