import { dashboardCopy } from './dashboard-copy'
import { defineStaticParams } from './route-params'

export type StaticParams = Array<Record<string, string>>

/** Route table shared by the in-app navigation (framework-free stand-in for file-system routes). */
export interface RouteDefinition {
  path: string
  title: string
  /** Same contract as Next.js generateStaticParams(): called with no arguments. */
  generateStaticParams?: () => StaticParams
}

export const dashboardRoute: RouteDefinition = {
  path: '/',
  title: dashboardCopy.dashboardTitle,
}

export const reportsRoute: RouteDefinition = {
  path: '/reports/:project',
  title: dashboardCopy.reportsTitle,
  generateStaticParams: defineStaticParams('project', ['acme']),
}
