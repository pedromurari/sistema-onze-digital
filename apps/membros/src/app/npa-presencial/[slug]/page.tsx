import { NpaPresencialClient } from './NpaPresencialClient'

export const revalidate = 0

export default async function NpaPresencialPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <NpaPresencialClient slug={slug} />
}
