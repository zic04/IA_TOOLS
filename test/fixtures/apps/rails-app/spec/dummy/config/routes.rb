# A test application is never read by the kit: this route is never one of the application.
Rails.application.routes.draw do
  get "/never", to: "never#index"
end
