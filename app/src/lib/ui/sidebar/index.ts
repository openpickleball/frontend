import Content from './sidebar-content.svelte';
import Footer from './sidebar-footer.svelte';
import Header from './sidebar-header.svelte';
import MenuButton from './sidebar-menu-button.svelte';
import MenuItem from './sidebar-menu-item.svelte';
import Menu from './sidebar-menu.svelte';
import Root from './sidebar.svelte';

// Only the parts the app shell uses. Add others with the CLI when the nav needs them.
export {
	Content,
	Footer,
	Header,
	Menu,
	MenuButton,
	MenuItem,
	Root,
	//
	Root as Sidebar,
	Content as SidebarContent,
	Footer as SidebarFooter,
	Header as SidebarHeader,
	Menu as SidebarMenu,
	MenuButton as SidebarMenuButton,
	MenuItem as SidebarMenuItem
};
