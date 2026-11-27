/**
 * shadcn-svelte Item, restyled to our tokens: a row with a title, an optional description and
 * actions on the right, such as a chevron. Profile's settings rows use it.
 *
 * Only the parts the app uses are kept (no Header, Footer, Media or Separator). `ItemGroup` is a
 * `<ul>` with a line between rows, so wrap each `Item` in an `<li>`. Render an `Item` as a link
 * or a button with its `child` snippet.
 */
import Actions from './item-actions.svelte';
import Content from './item-content.svelte';
import Description from './item-description.svelte';
import Group from './item-group.svelte';
import Title from './item-title.svelte';
import Root, { itemClass } from './item.svelte';

export {
	Root,
	Group,
	Content,
	Title,
	Description,
	Actions,
	itemClass,
	//
	Root as Item,
	Group as ItemGroup,
	Content as ItemContent,
	Title as ItemTitle,
	Description as ItemDescription,
	Actions as ItemActions
};
