import { SourceExplorer } from "@/components/sources/source-explorer";
import { getSourceList } from "@/lib/api/sources-server";
import { parseSourceSearchParams, sourceSearchStateToParams } from "@/lib/sources-query";

type SourcesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SourcesPage(props: SourcesPageProps) {
  const searchParams = await props.searchParams;
  const searchState = parseSourceSearchParams(searchParams);
  const sourceParams = sourceSearchStateToParams(searchState);
  const sourceList = await getSourceList(sourceParams);

  return (
    <SourceExplorer
      initialParams={sourceParams}
      initialTrail={searchState.trail}
      initialData={sourceList}
    />
  );
}

