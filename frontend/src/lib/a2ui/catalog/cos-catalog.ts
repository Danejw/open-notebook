import { Catalog } from '@a2ui/web_core/v0_9'
import {
  AudioPlayer,
  Button,
  Card,
  CheckBox,
  ChoicePicker,
  Column,
  DateTimeInput,
  Divider,
  Icon,
  Image,
  List,
  Modal,
  Row,
  Slider,
  Tabs,
  Text,
  TextField,
  Video,
  basicCatalog,
  type ReactComponentImplementation,
} from '@a2ui/react/v0_9'
import { AskUser } from '@/components/a2ui/cos-components'
import { COS_CATALOG_ID } from '@/lib/a2ui/constants'

const basicComponents = [
  Text,
  Image,
  Icon,
  Video,
  AudioPlayer,
  Row,
  Column,
  List,
  Card,
  Tabs,
  Divider,
  Modal,
  Button,
  TextField,
  CheckBox,
  ChoicePicker,
  Slider,
  DateTimeInput,
] as ReactComponentImplementation[]

const cosComponents = [AskUser] as ReactComponentImplementation[]

/**
 * Construction OS catalog: Basic Catalog primitives + AskUser.
 */
export const cosCatalog = new Catalog<ReactComponentImplementation>(
  COS_CATALOG_ID,
  [...basicComponents, ...cosComponents],
  Array.from(basicCatalog.functions.values())
)
