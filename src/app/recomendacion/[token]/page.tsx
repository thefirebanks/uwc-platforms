import { RecommenderForm } from "@/components/recommender-form";

export default async function RecommendationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <RecommenderForm token={token} />;
}

