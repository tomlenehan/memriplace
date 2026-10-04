import {ChakraProvider} from "@chakra-ui/react"
import {QueryClient, QueryClientProvider} from "@tanstack/react-query"
import {RouterProvider, createRouter} from "@tanstack/react-router"
import ReactDOM from "react-dom/client"
import {routeTree} from "./routeTree.gen"

import {Provider} from 'react-redux';
import store from './redux/store';

import {StrictMode} from "react"
import {OpenAPI} from "./client"
import { API_BASE_URL } from "./config"
import theme from "./theme"
import { ReadingTextSizeProvider } from "./components/Common/ReadingTextSize"

OpenAPI.BASE = API_BASE_URL
OpenAPI.TOKEN = async () => {
    return localStorage.getItem("access_token") || ""
}

const queryClient = new QueryClient()

const router = createRouter({routeTree})
declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router
    }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <Provider store={store}>
            <ChakraProvider theme={theme}>
                <QueryClientProvider client={queryClient}>
                    <ReadingTextSizeProvider>
                        <RouterProvider router={router} />
                    </ReadingTextSizeProvider>
                </QueryClientProvider>
            </ChakraProvider>
        </Provider>
    </StrictMode>
);
