export default function ArtistPage({ params }: { params: { id: string } }) {
  return (
    <main>
      <h1>Artist: {params.id}</h1>
    </main>
  )
}
