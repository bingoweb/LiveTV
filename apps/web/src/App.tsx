import { appMeta } from './app-meta'

export function App() {
  return (
    <main>
      <h1>{appMeta.name}</h1>
      <p>{appMeta.phase} foundation</p>
    </main>
  )
}
