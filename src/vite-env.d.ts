/// <reference types="vite/client" />

interface Window {
  ___gcfg?: {
    lang?: string;
  };
  renderOptIn?: () => void;
  gapi?: {
    load: (name: string, callback: () => void) => void;
    surveyoptin?: {
      render: (config: {
        merchant_id: number;
        order_id: string;
        email: string;
        delivery_country: string;
        estimated_delivery_date: string;
      }) => void;
    };
    ratingbadge?: {
      render: (container: HTMLElement, config: { merchant_id: number }) => void;
    };
  };
  merchantwidget?: {
    start: (config: { merchant_id: number; position?: string; region?: string }) => void;
  };
}
