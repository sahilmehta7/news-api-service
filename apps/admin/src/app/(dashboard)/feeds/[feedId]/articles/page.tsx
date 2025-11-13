import { FeedArticlesView } from "@/components/articles/feed-articles-view";
import { getFeedById } from "@/lib/api/feeds-server";

type FeedArticlesPageProps = {
  params: Promise<{ feedId: string }>;
};

export default async function FeedArticlesPage(props: FeedArticlesPageProps) {
  const { feedId } = await props.params;
  const feed = await getFeedById(feedId);

  return <FeedArticlesView feed={feed} />;
}

