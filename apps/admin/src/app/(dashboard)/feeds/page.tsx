import { FeedExplorer } from "@/components/feeds/feed-explorer";
import { getFeedList } from "@/lib/api/feeds-server";
import { feedSearchStateToParams, parseFeedSearchParams } from "@/lib/feeds-query";

type FeedsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function FeedsPage(props: FeedsPageProps) {
  const searchParams = await props.searchParams;
  const searchState = parseFeedSearchParams(searchParams);
  const feedParams = feedSearchStateToParams(searchState);
  const feedList = await getFeedList(feedParams);

  return (
    <FeedExplorer
      initialParams={feedParams}
      initialTrail={searchState.trail}
      initialData={feedList}
      initialSearchParams={searchParams}
    />
  );
}

