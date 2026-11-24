import { Navigation, WebView, useEffect } from "scripting"

export function presentBoard(controller: WebViewController, onReady: (dismiss: () => void) => void) {
  function Board() {
    const dismiss = Navigation.useDismiss()
    useEffect(() => { onReady(dismiss) }, [])
    return <WebView controller={controller} ignoresSafeArea={{regions: "container", edges: "bottom"}} frame={{maxWidth: "infinity", maxHeight: "infinity"}} />
  }
  return Navigation.present({element: <Board />, modalPresentationStyle: "fullScreen"})
}
